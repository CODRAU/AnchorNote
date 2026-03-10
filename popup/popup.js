let currentTool = 'highlighter';
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
    const tool = event.target.dataset.tool;
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
    chrome.storage.local.set({ color: currentColor }); // save on change
}

function setTool(tool) {
    currentTool = tool;

    document.getElementById('btn-highlighter').classList.toggle('active', tool === 'highlighter');
    document.getElementById('btn-marker').classList.toggle('active', tool === 'marker');
    document.getElementById('status-text').textContent = 
        tool === 'highlighter' ? 'Highlighter active' : 'Marker active';

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

// Restore state on popup load — runs once when popup opens
chrome.storage.local.get(['tool', 'color'], (result) => {
  if (result.tool) setTool(result.tool);
  if (result.color) {
        const btn = [...document.querySelectorAll('.color-btn')]
            .find(b => b.getAttribute('data-color').includes(result.color));
        if (btn) setColor(btn, result.color);
  }
});