let currentTool = 'no_tool';
let currentColor = '#FFD700';

document.addEventListener("DOMContentLoaded", () => {

    const colorButtons = document.querySelectorAll(".color-btn");
    const toolButtons = document.querySelectorAll(".tool-btn");

    colorButtons.forEach(button => {
        button.addEventListener("click", handleColorClick);
    });

    toolButtons.forEach(button => {
        button.addEventListener("click", handleToolClick);
    });

    document.getElementById("clearMarker").addEventListener("click", clearMarker);
    document.getElementById("clearHighlights").addEventListener("click", clearHighlights);
});

function handleColorClick(event) {
  const color = event.target.dataset.color;
  setColor(event.target, color);
}

function handleToolClick(event) {
    let tool = event.target.dataset.tool;
    if (tool === currentTool) tool = 'no_tool';
    console.log(tool);
    setTool(tool);
}

function setColor(btn, color) {
    currentColor = color;

    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {

    chrome.tabs.sendMessage(
      tabs[0].id,
      {
        type: "SET_ANNOTATION_COLOR",
        value: color
      }
    );

    });

    console.log("current color save: ", currentColor);
    drawMarkerPreview();
    chrome.storage.local.set({ color: currentColor }); // save on change
}

function setTool(tool) {
    currentTool = tool;

    document.getElementById('btn-highlighter').classList.toggle('active', tool === 'highlighter');
    document.getElementById('btn-marker').classList.toggle('active', tool === 'marker');
    document.getElementById('btn-eraser').classList.toggle('active', tool === 'eraser');

    let text = "No tool active";
    document.querySelector('.status-dot').classList.toggle('dot-red', tool === 'no_tool');

    if (currentTool !== "no_tool") {
        text = tool === 'highlighter' ? 'Highlighter active' : 'Marker active';
    } 

    document.getElementById('status-text').textContent = text;

    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {

    chrome.tabs.sendMessage(
      tabs[0].id,
      {
        type: "SET_TOOL",
        value: tool
      }
    );

    });

    chrome.storage.local.set({ tool: currentTool }); // save on change
}

function clearMarker() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'CLEAR_MARKER' });
    });
}

function clearHighlights() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'CLEAR_HIGHLIGHTS' });
    });
}

document.getElementById('marker-size').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('marker-size-label').textContent = `${val}px`;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_MARKER_SIZE', value: val });
    });
    chrome.storage.local.set({ markerSize: val });
    drawMarkerPreview();
});

document.getElementById('marker-opacity').addEventListener('change', (e) => {
    console.log("SLIDER: ", parseInt(e.target.value));
    let opacity = parseInt(e.target.value);
    opacity = Math.max(0, Math.min(100, opacity)); // clamp 0-100
    e.target.value = opacity;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_MARKER_OPACITY', value: opacity });
    });

    chrome.storage.local.set({ markerOpacity: opacity });
    drawMarkerPreview();
});

function drawMarkerPreview() {
    const canvas = document.getElementById('marker-preview');
    const ctx = canvas.getContext('2d');
    const size = parseInt(document.getElementById('marker-size').value);
    const opacity = parseInt(document.getElementById('marker-opacity').value);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const opacityHex = Math.round(opacity / 100 * 255).toString(16).padStart(2, '0');
    ctx.beginPath();
    ctx.arc(25, 25, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = currentColor + opacityHex;
    ctx.fill();
}

document.getElementById('color-picker').addEventListener('input', (e) => {
    const color = e.target.value;
    // deactivate other color buttons
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('color-custom-btn').classList.add('active');
    currentColor = color;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_ANNOTATION_COLOR', value: color });
    });
    chrome.storage.local.set({ color });
    drawMarkerPreview();
});

// Restore state on popup load — runs once when popup opens
chrome.storage.local.get(['tool', 'color', 'markerSize', 'markerOpacity'], (result) => {
    if (result.tool) setTool(result.tool);
    
    if (result.color) {
        const btn = [...document.querySelectorAll('.color-btn')]
            .find(b => b.getAttribute('data-color') === result.color);
        if (btn) {
            // matches a preset color button
            currentColor = result.color;
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_ANNOTATION_COLOR', value: result.color });
            });
        } else {
            // custom color
            currentColor = result.color;
            document.getElementById('color-picker').value = result.color;
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('color-custom-btn').classList.add('active');
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_ANNOTATION_COLOR', value: result.color });
            });
        }
    }

    if (result.markerOpacity) {
        document.getElementById("marker-opacity").value = result.markerOpacity;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_MARKER_OPACITY', value: result.markerOpacity });
        });
    }

    if (result.markerSize) {
        document.getElementById("marker-size").value = result.markerSize;
        document.getElementById('marker-size-label').textContent = `${result.markerSize}px`;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_MARKER_SIZE', value: result.markerSize });
        });
    }

    drawMarkerPreview(); // always last
});