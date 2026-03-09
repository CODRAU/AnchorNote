console.log("content.js loaded");

let annotationColor = "yellow";
let allowHighlight = true;

document.addEventListener("mouseup", handleMouseUp);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.type === "SET_ANNOTATION_COLOR") {
        annotationColor = request.value;

        console.log("annotationColor updated:", annotationColor);

        sendResponse({success: true});
    }

    if (request.type === "TOGGLE_HIGHLIGHT") {
       allowHighlight = !allowHighlight;

        console.log("allowHighlight updated:", allowHighlight);

        sendResponse({success: true});
    }

});

function handleMouseUp() {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed) return;

    const selectedText = selection.toString().trim();

    if (selectedText.length > 0) {
        console.log("User selected: ", selectedText);
    }

    const range = selection.getRangeAt(0);

    if (allowHighlight) {
        highlightRange(range);
    }

    selection.removeAllRanges();
}

function highlightRange(range) {
    //List of all nodes within the range
    nodes = getNodesInRange(range);

    //Traversing through all nodes within the range
    [...nodes].forEach(node => {
        if (node.isConnected) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                //If the element is of our highlight class
                if (node.classList.contains("anchornote-highlight")) {
                    //In case we need to fix the start of range if node starts before range
                    let rangeStartNode = null;

                    if (nodeStartsBeforeRange(node, range)) {
                        //Extract contents from the element that are outside of the range
                        const nodeRange = document.createRange();

                        nodeRange.selectNodeContents(node);
                        nodeRange.setEnd(range.startContainer, range.startOffset);
                        
                        const extracted = nodeRange.extractContents();

                        console.log("node contents after extract:", node.innerHTML);
                        console.log("node.firstChild:", node.firstChild);
                        console.log("range start before setStart:", range.startContainer, range.startOffset);

                        
                        //Create new span
                        const newSpan = document.createElement("span");
                        //Copy all attributes from the original span
                        for (const attr of node.attributes) {
                            newSpan.setAttribute(attr.name, attr.value);
                        }
                        //Re-wrap extracted contents with identical span
                        newSpan.appendChild(extracted);
                        //Insert extracted contents before current node and right before range
                        node.parentNode.insertBefore(newSpan, node);

                        //Save reference before unwrap
                        rangeStartNode = node.firstChild; 


                    } else if (nodeEndsAfterRange(node, range)) {
                        const nodeRange = document.createRange();

                        nodeRange.selectNodeContents(node);
                        nodeRange.setStart(range.endContainer, range.endOffset);
                        
                        const extracted = nodeRange.extractContents();
                        
                        //Create new span
                        const newSpan = document.createElement("span");
                        //Copy all attributes from the original span
                        for (const attr of node.attributes) {
                            newSpan.setAttribute(attr.name, attr.value);
                        }
                        //Re-wrap extracted contents with identical span
                        newSpan.appendChild(extracted);
                        //Insert extracted contents after current node and right after range
                        node.parentNode.insertBefore(newSpan, node.nextSibling);

                        //Update the range to end at the end of the now-trimmed node
                        range.setEnd(node, node.childNodes.length);
                    }

                    //Dissolve the span completely within the range without deleting the contents inside
                    while (node.firstChild) {
                        node.parentNode.insertBefore(node.firstChild, node);
                    }
                    node.remove();

                    // Set range start AFTER unwrap so firstChild is in correct DOM position
                    if (rangeStartNode) {
                        range.setStart(rangeStartNode, 0);
                    }
                }
            }
        }
    });

    //Creating final span to wrap the whole range
    const rangeSpan = document.createElement("span");
    rangeSpan.classList.add("anchornote-highlight");
    rangeSpan.style.backgroundColor = annotationColor;

    console.log("range before surroundContents:", range.toString());
    range.surroundContents(rangeSpan);
}


//checks if current node starts before the range
function nodeStartsBeforeRange(node, range) {
    const nodeRange = document.createRange();
    nodeRange.setStartBefore(node);
    nodeRange.setEnd(range.startContainer, range.startOffset);
    return nodeRange.toString().length > 0;
}

//checks if current node continues after the range
function nodeEndsAfterRange(node, range) {
    const nodeRange = document.createRange();
    nodeRange.setStart(range.endContainer, range.endOffset);
    nodeRange.setEndAfter(node);
    return nodeRange.toString().length > 0;
}


//Returns list of nodes in range
function getNodesInRange(range) {
    const container = range.commonAncestorContainer;
    const nodes = [];

    const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_ALL,
        {
        acceptNode: function(node) {
            // comparePoint returns -1 (before), 0 (inside), or 1 (after)
            const nodeEnd = node.nodeType === Node.TEXT_NODE ? node.length : node.childNodes.length;

            if (range.comparePoint(node, 0) > 0) {
            return NodeFilter.FILTER_REJECT; // Node starts after range ends — prune subtree
            }
            if (range.comparePoint(node, nodeEnd) < 0) {
            return NodeFilter.FILTER_SKIP; // Node ends before range starts — skip but check siblings
            }
            return NodeFilter.FILTER_ACCEPT;
        }
        }
    );

    // If the container itself is a text node, include it directly
    if (container.nodeType === Node.TEXT_NODE) {
        return [container];
    }

    while (walker.nextNode()) {
        nodes.push(walker.currentNode);
    }

    return nodes;
}