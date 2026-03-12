console.log("content.js loaded");

const state = {
    tool: 'highlighter',
    color: '#FFD700',
    markerSize: 16,
    markerOpacity: 50,
}


//Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("LISTENING TO REQUEST");
    switch(request.type) {
        case 'SET_TOOL':
            console.log("SETTING TOOL: ", request.value);
            state.tool = request.value;
            console.log("STATE.TOOL: ", state.tool);
            disableMarkerMode();
            disableEraserMode();
            if (request.value === 'marker') enableMarkerMode();
            else if (request.value === 'eraser') enableEraserMode();
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
        case 'SET_MARKER_SIZE':
            state.markerSize = request.value;
            break;
        case 'SET_MARKER_OPACITY':
            state.markerOpacity = request.value;
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
let operations = [];
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
}

function onMarkerMouseDown(e) {
    isDrawing = true;
    currentStroke = {
        type: 'stroke',
        //Normalizing coordinates
        points: [
            (e.clientX + window.scrollX) / document.body.scrollWidth,
            (e.clientY + window.scrollY) / document.body.scrollHeight
        ],
        color: state.color,
        size: state.markerSize,
        opacity: state.markerOpacity
    };
}

function onMarkerMouseMove(e) {
    if (!isDrawing) return;
    currentStroke.points.push(
        (e.clientX + window.scrollX) / document.body.scrollWidth,
        (e.clientY + window.scrollY) / document.body.scrollHeight
    );
    requestAnimationFrame(redraw);
}

function onMarkerMouseUp() {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentStroke) operations.push(currentStroke);
    currentStroke = null;
}


function drawStrokeToCtx(ctx, stroke) {
    const points = stroke.points;
    if (points.length < 4) return;
    ctx.beginPath();
    ctx.moveTo(
        points[0] * document.body.scrollWidth - window.scrollX,
        points[1] * document.body.scrollHeight - window.scrollY
    );
    for (let i = 2; i < points.length; i += 2) {
        ctx.lineTo(
            points[i] * document.body.scrollWidth - window.scrollX,
            points[i+1] * document.body.scrollHeight - window.scrollY
        );
    }
    const opacityHex = Math.round(stroke.opacity / 100 * 255).toString(16).padStart(2, '0');
    ctx.strokeStyle = stroke.color + opacityHex;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
}

function clearMarker() {
    operations = [];
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


//------------------------------------------------------------------------------
//ERASER FUNCTIONALITY
//------------------------------------------------------------------------------

let isErasing = false;

function enableEraserMode() {
    if (!markerCanvas) return; // nothing to erase if canvas doesn't exist
    markerCanvas.style.pointerEvents = 'auto';
    markerCanvas.style.cursor = 'cell';
    markerCanvas.addEventListener('mousedown', onEraserMouseDown);
    markerCanvas.addEventListener('mousemove', onEraserMouseMove);
    markerCanvas.addEventListener('mouseup', onEraserMouseUp);
    markerCanvas.addEventListener('mouseleave', onEraserMouseUp);
}

function disableEraserMode() {
    if (markerCanvas) {
        markerCanvas.style.pointerEvents = 'none';
        markerCanvas.removeEventListener('mousedown', onEraserMouseDown);
        markerCanvas.removeEventListener('mousemove', onEraserMouseMove);
        markerCanvas.removeEventListener('mouseup', onEraserMouseUp);
        markerCanvas.removeEventListener('mouseleave', onEraserMouseUp);
    }
    isErasing = false;
}

function onEraserMouseDown(e) {
    isErasing = true;
    eraseAtPoint(e.clientX + window.scrollX, e.clientY + window.scrollY);
}

function onEraserMouseMove(e) {
    if (!isErasing) return;
    eraseAtPoint(e.clientX + window.scrollX, e.clientY + window.scrollY);
}

function onEraserMouseUp() {
    isErasing = false;
}

function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2);
}

function eraseAtPoint(x, y) {
    const nx = x / document.body.scrollWidth;
    const ny = y / document.body.scrollHeight;
    const nr = state.markerSize / document.body.scrollWidth;
    operations.push({ type: 'erase', nx, ny, nr });
    requestAnimationFrame(redraw);
}

//Redraw
function redraw() {
    const offscreen = new OffscreenCanvas(markerCanvas.width, markerCanvas.height);
    const offCtx = offscreen.getContext('2d');

    const allOps = currentStroke ? [...operations, currentStroke] : operations;

    allOps.forEach(op => {
        if (op.type === 'stroke') {
            drawStrokeToCtx(offCtx, op);
        } else if (op.type === 'erase') {
            offCtx.save();
            offCtx.globalCompositeOperation = 'destination-out';
            offCtx.beginPath();
            offCtx.arc(
                op.nx * document.body.scrollWidth - window.scrollX,
                op.ny * document.body.scrollHeight - window.scrollY,
                op.nr * document.body.scrollWidth,
                0, Math.PI * 2
            );
            offCtx.fillStyle = 'rgba(0,0,0,1)';
            offCtx.fill();
            offCtx.restore();
        }
    });

    markerCtx.clearRect(0, 0, markerCanvas.width, markerCanvas.height);
    markerCtx.drawImage(offscreen, 0, 0);
}