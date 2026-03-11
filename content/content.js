console.log("content.js loaded");

const state = {
    tool: 'highlighter',
    color: '#FFD700',
}

//Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("LISTENING TO REQUEST");
    switch(request.type) {
        case 'SET_TOOL':
            console.log("SETTING TOOL: ", request.value);
            state.tool = request.value;
            console.log("STATE.TOOL: ", state.tool);
            if (request.value === 'marker') enableMarkerMode();
            else disableMarkerMode();
            sendResponse({success: true});
            break;
        case 'SET_ANNOTATION_COLOR':
            state.color = request.value;
            sendResponse({success: true});
            break;
        case 'CLEAR_MARKER':
            clearMarker();
            break;
        case 'CLEAR_HIGHLIGHTS':
            clearHighlights();
            break;
    }
});

// HIGHLIGHTER FUNCTIONALITY
//------------------------------------------------------------------------------
document.addEventListener("mouseup", handleMouseUp);

function handleMouseUp() {
    console.log("MOUSEUP TOOL: ", state.tool);

    if (state.tool !== 'highlighter') return;

    const selection = window.getSelection();

    if (!selection || selection.isCollapsed) return;

    const selectedText = selection.toString().trim();

    if (selectedText.length === 0) return;

    const range = selection.getRangeAt(0);
    highlightRange(range);
    selection.removeAllRanges();
}

//highlights the range
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
    rangeSpan.style.backgroundColor = state.color;

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

//Clears all highlights
function clearHighlights() {
    console.log("Clearing highlights");
    document.querySelectorAll('.anchornote-highlight').forEach(span => {
        while (span.firstChild) {
        span.parentNode.insertBefore(span.firstChild, span);
        }
        span.remove();
    });
}

//------------------------------------------------------------------------------
//MARKER FUNCTIONALITY
//------------------------------------------------------------------------------

// Marker state
let isDrawing = false;
let markerCanvas = null;
let markerCtx = null;
let markerSize = 16;
let strokes = [];
let currentStroke = null;

function enableMarkerMode() {
    // Create canvas overlay if it doesn't exist
    if (!markerCanvas) {
        markerCanvas = document.createElement('canvas');
        markerCanvas.id = 'anchornote-marker-canvas';
        markerCanvas.style.position = 'fixed';
        markerCanvas.style.top = '0';
        markerCanvas.style.left = '0';
        markerCanvas.style.zIndex = '2147483647';
        markerCanvas.style.pointerEvents = 'none'; // will toggle on/off
        markerCanvas.style.cursor = 'crosshair';
        

        markerCanvas.style.width = `${window.innerWidth}px`;
        markerCanvas.style.height = `${window.innerHeight}px`;
        markerCanvas.width = window.innerWidth;
        markerCanvas.height = window.innerHeight;
        
        markerCanvas.style.willChange = 'transform';

        document.body.appendChild(markerCanvas);

        markerCtx = markerCanvas.getContext('2d');
    }

    // Enable pointer events on canvas so it captures mouse
    markerCanvas.style.pointerEvents = 'auto';

    // Add event listeners
    markerCanvas.addEventListener('mousedown', onMarkerMouseDown);
    markerCanvas.addEventListener('mousemove', onMarkerMouseMove);
    markerCanvas.addEventListener('mouseup', onMarkerMouseUp);
    markerCanvas.addEventListener('mouseleave', onMarkerMouseUp);
    

    console.log('Marker mode enabled');
}

function redraw() {
    markerCtx.clearRect(0, 0, markerCanvas.width, markerCanvas.height);
    markerCtx.save();
    markerCtx.translate(-window.scrollX, -window.scrollY); // offset by scroll
    strokes.forEach(stroke => drawStroke(stroke));
    if (currentStroke) drawStroke(currentStroke);
    markerCtx.restore();
}

window.addEventListener('scroll', () => {
    if (markerCanvas) requestAnimationFrame(redraw);
});

function disableMarkerMode() {
    if (markerCanvas) {
        markerCanvas.style.pointerEvents = 'none';
        markerCanvas.removeEventListener('mousedown', onMarkerMouseDown);
        markerCanvas.removeEventListener('mousemove', onMarkerMouseMove);
        markerCanvas.removeEventListener('mouseup', onMarkerMouseUp);
        markerCanvas.removeEventListener('mouseleave', onMarkerMouseUp);
    }
    isDrawing = false;
    console.log('Marker mode disabled');
}

function onMarkerMouseDown(e) {
    isDrawing = true;
    currentStroke = {
        points: [e.clientX + window.scrollX, e.clientY + window.scrollY],
        color: state.color,
        size: markerSize
    };
}

function onMarkerMouseMove(e) {
    if (!isDrawing) return;
    currentStroke.points.push(e.clientX + window.scrollX, e.clientY + window.scrollY);
    requestAnimationFrame(redraw);
}

function onMarkerMouseUp() {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentStroke) strokes.push(currentStroke);
    currentStroke = null;
}

function redraw() {
    markerCtx.clearRect(0, 0, markerCanvas.width, markerCanvas.height);
    markerCtx.save();
    markerCtx.translate(-window.scrollX, -window.scrollY);
    strokes.forEach(stroke => drawStroke(stroke));
    if (currentStroke) drawStroke(currentStroke);
    markerCtx.restore();
}

function drawStroke(stroke) {
    const points = stroke.points;
    if (points.length < 2) return;
    markerCtx.beginPath();
    markerCtx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) {
        markerCtx.lineTo(points[i], points[i + 1]);
    }
    markerCtx.strokeStyle = stroke.color + '80';
    markerCtx.lineWidth = stroke.size;
    markerCtx.lineCap = 'round';
    markerCtx.lineJoin = 'round';
    markerCtx.stroke();
}

function clearMarker() {
    strokes = [];
    currentStroke = null;
    if (markerCtx) markerCtx.clearRect(0, 0, markerCanvas.width, markerCanvas.height);
}

// Handle window resize — rescale canvas
window.addEventListener('resize', () => {
    if (markerCanvas) {
        markerCanvas.width = window.innerWidth;
        markerCanvas.height = window.innerHeight;
        markerCanvas.style.width = `${window.innerWidth}px`;
        markerCanvas.style.height = `${window.innerHeight}px`;
        redraw(); // redraw after resize since resizing clears the canvas
    }
});