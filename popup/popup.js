

document.addEventListener("DOMContentLoaded", () => {

    const buttons = document.querySelectorAll(".color-btn");

    buttons.forEach(button => {
        button.addEventListener("click", handleColorClick);
    });

});

function handleColorClick(event) {
  const color = event.target.dataset.color;
  setColor(color);
}

function setColor(color) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {

    chrome.tabs.sendMessage(
      tabs[0].id,
      {
        type: "SET_ANNOTATION_COLOR",
        value: color
      }
    );

    });
}