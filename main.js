const electron = require('electron');
const app = electron.app;
const Menu = electron.Menu;
const Tray = electron.Tray;

const { net } = require('electron');
const path = require('path');
const url = require('url');
const http = require('http');
const fs = require('fs');
const child = require('child_process');
const BrowserWindow = electron.BrowserWindow;
const ipcMain = electron.ipcMain;


let tray;
let mainWindow;
var location = null;
const isDarwin = process.platform=="darwin";
const isLinux = process.platform=="linux";
const isWin = process.platform=="win32";

const refreshInterval = 1*60*60; // 1 hour in seconds

var newCalendar = false;
var calendar = [];
var timeout = null;

const calendarURL = path.join(app.getPath("userData"), "calendar_url.dat");
const calendarFile = path.join(app.getPath("userData"), "calendar.dat");

function getCalendarURL() {
  try {
      var text = fs.readFileSync(calendarURL);
      return ""+text;
  } catch (e) {
      console.log(e);
      return null;
  }

}

function toDate(x) {
  var e = x.split("T");
  var y = e[0].substring(0,4);
  var m = e[0].substring(4,6)*1-1;
  var d = e[0].substring(6);
  var h = e[1].substring(0,2);
  var min = e[1].substring(2,4);
  var date = new Date(Date.UTC(y,m,d,h,min));
  return date;
}

function downloadCalendar() {
  var url = getCalendarURL();
  console.log(url);
  if (url==null) {
    showWindow();
    return;
  }
  console.log("will download calendar file from "+url);
  const request = net.request(url);
  var data = "";
  request.on("response", (response) => {
    response.on("data", (chunk) => {
      data+=chunk;
    });
    response.on("end", () => {
      var lines = data.split("\n");
      var inEvent = false;
      var start = 0;
      var end = 0;
      var rStart = "";
      var rEnd = "";
      var title = "NONE";
      var results = [];
      for (var i=0; i<lines.length; i++) {
        var line = lines[i];
        if (line.startsWith("BEGIN:VEVENT")) {
          inEvent=true;
          continue;
        }
        if (line.startsWith("END:VEVENT")) {
          inEvent=false;
          results.push({start:start, end:end, title:title, rstart:rStart, rend:rEnd});
          start=0;
          end=0;
          title="NONE";
          continue;
        }
        if (line.startsWith("DTSTART")) {
          rStart=line.split(":")[1];
          start=toDate(line.split(":")[1]);
          continue;
        }
        if (line.startsWith("DTEND")) {
          rEnd=line.split(":")[1];
          end=toDate(line.split(":")[1]);
          continue;
        }
        if (line.startsWith("SUMMARY")) {
          title=line.substring("SUMMARY:".length);
          continue;
        }
      }
      fs.writeFileSync(calendarFile, JSON.stringify(results));
      console.log("Stored calendar in "+calendarFile);
      newCalendar=true;
      displayTimer();
    });
  });
  request.on("error", (error) => {
    displayTimer();
  });
  request.end();
}

var last = -1;

function showWindow() {
  mainWindow = new BrowserWindow({width: 500, height: 150, webPreferences: {nodeIntegration: true}});

  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  var calUrl = getCalendarURL();
  console.log(calUrl);
  if (calUrl!=null) {
    console.log("url is "+calUrl);
    mainWindow.on("show", function() {
      setTimeout(function() {
        console.log("sending...");
        mainWindow.webContents.send("set-url", calUrl);
        console.log("send");
      },10);
    });
  }

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function startApp() {

    tray = new Tray(path.join(__dirname, 'ic_launcher.png'));
    var menu = [];
    menu.push({
      label: "Configure",
      click() {
        showWindow();
      }
    })
    const contextMenu = Menu.buildFromTemplate(menu);

    tray.setContextMenu(contextMenu);
    tray.setTitle("Waiting...");

    app.on('window-all-closed', function () {
      // On OS X it is common for applications and their menu bar
      // to stay active until the user quits explicitly with Cmd + Q
    });


    displayTimer();

    if (isDarwin) {
      app.dock.hide();
    }

}

function refresh() {
  console.log("Refreshing....");
  downloadCalendar();
  last=new Date();
}

function lz(s) {
  s=""+s;
  while (s.length<2) s="0"+s;
  return s;
}

function toText(timestamp) {
  // OK, its magic....
  var s = timestamp/1000;
  var d = Math.floor(s/86400);
  var inDay = s%86400;
  var h = Math.floor(inDay/3600);
  var m1 = Math.ceil(inDay%3600/60);
  var m = Math.ceil(inDay%3600/60)%60;
  if (m1==60) h++;
  return (d>0?(d+"d "):"")+(lz(h)+":"+lz(m));
}

function getCalendar() {
  if (newCalendar) {
    newCalendar = false;
    try {
        var text = fs.readFileSync(calendarFile);
        console.log("Read calendar from "+calendarFile);
        calendar=JSON.parse(text);
    } catch (e) {
        console.log(e);
    }
  }
  return calendar;
}

function displayTimer() {
  if (timeout) clearTimeout(timeout);
  console.log(new Date()*1-last);
  console.log(new Date()*1-last>refreshInterval*1000);
  if ((new Date()*1-last)>refreshInterval*1000) {
    refresh();
    return;
  } else {
    var calendar = getCalendar();
    var now = new Date()*1;
    var during = false;
    var toEnd = now*1;
    var toEndTitle = "";
    var toStart = now*1000;
    var toStartTitle = "";
    var timerAvailable = false;
    for (var i=0; i<calendar.length; i++) {
      var event = calendar[i];
      event.start=new Date(event.start);
      event.end=new Date(event.end);
      if (event.start-now>0 && event.start-now<toStart) {
        toStart=event.start-now;
        toStartTitle=event.title;
        timerAvailable=true;
      }
      if (event.end-now>0 && event.end-now<toEnd) {
        toEnd=event.end-now;
        toEndTitle=event.title;

      }
      during|=event.start<=now && event.end>=now;
    }
    if (timerAvailable) {
      tray.setTitle(toText(during?toEnd:toStart));
      var imgLocation = app.getAppPath() + "/" + (during?"red":"green") + ".png";
      tray.setImage(imgLocation);
    }
  }
  // ideally we would like to have this called around full minute
  var next = (Math.floor((now/1000/60))*60+60)*1000;
  timeout=setTimeout(displayTimer,next-now);
}

function toMap(ar) {
    var m = {};
    for (var i = 0; i < ar.length; i++) {
        var item = ar[i];
        m[item.name] = item.value;
    }
    return m;
}

ipcMain.on("setUrl",(event,url) => {
  console.log("Get message");
  console.log("Got URL "+url);
  if (url.startsWith("webcal")) url=url.replace("webcal","https");
  fs.writeFileSync(calendarURL, url);
  downloadCalendar();
});

app.on('ready', startApp);
