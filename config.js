const {ipcRenderer, shell} = require('electron');

function $(id) {
  return document.getElementById(id);
}

$("save").onclick=function() {
  var url = $("url").value;
  ipcRenderer.send("setUrl",url);
  window.close();
}

ipcRenderer.on("set-url", (event,url) => {
  $("url").value=url;
});

window.onload=function() {
  $("loading").style.visibility="hidden";
  $("content").style.visibility="visible";
}
