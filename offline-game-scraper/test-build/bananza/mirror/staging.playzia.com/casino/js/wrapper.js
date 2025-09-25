let currency;
let language;
let gameCode;
let channel;
let mode;
let homeUrl;
let platformConfig;
let gameParam = {};
let tokenUrl;
let launchUrl;
let apiUrl;
let iframeElement;
let balance;

function loadPlatformConfig() {
	platformConfig = "./configuration/platformConfig.json";
	$.ajax({
		async: false,
		url: platformConfig,
		type: 'GET',
		success: function (res) {
			platformData = res;
			initiatePage();
		}
	});
}

//disable zoom
document.addEventListener('gesturestart', function (event) {
    event.preventDefault();
}, false);

document.addEventListener('touchmove', function (event) {
    if (event.scale !== 1) { event.preventDefault(); }
}, false);


// initiate the wrapper
function initiatePage() {
	iframeElement = document.getElementById("iframe");
	
	gameParam = getUrlVars(window.location.href);
	language = gameParam.language || 'en';
	currency = gameParam.currency || 'EUR';
	gameCode = gameParam.gameCode;
	balance = gameParam.balance || 100000;
  gameFolderName = gameCode;
  isReal = false;
	mode = "DEMO";
 
 if(gameParam.gameCode.includes("playzia-thegreatfishingadventure-")){
    gameCode = gameCode.replace("playzia-thegreatfishingadventure-", "playzia-tgfa-");
 }
 
 document.getElementById("iframe").contentWindow.location.ancestorOrigins
	
    if(gameParam.homeUrl){
       homeUrl = decodeURIComponent(gameParam.homeUrl);
    }
	
	channel = detectmob();
	userAgent = window["platform"];
	window.setFullScreen = true;
	launchUrl = platformData.launchUrl;
	apiUrl = platformData.apiUrl; 
	sendGetTokenRequest();
}

function sendGetTokenRequest() {

    let requestData = {
        currency: currency,
        gameCode: gameCode,
        mode: mode,
        language: language,
        balance: balance
    };
	
	var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
            if (xhr.status === 200 && xhr.response && JSON.parse(xhr.response).url) {
            let gameMode = "2";
   
				let launchData = getUrlVars(JSON.parse(xhr.response).url);
                iframeElement.src = launchUrl + "games/" + gameFolderName + "/index.html?token=" + launchData["token"]+"&login=" + launchData["login"]
				+"&currency="+ currency +"&gameCode="+ gameCode +"&mode="+ gameMode +"&language="+ language;
            } else {
		    	showErrorMsg("Getting Error on game load. Please Reload the game.");
                console.log("Getting Error on game load.");
            }
        }
    };
				
    xhr.open("POST", apiUrl + "token", true);
    xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    xhr.withCredentials = false;
    xhr.send(JSON.stringify(requestData));
}

function msgPanelBtnClick(){
    document.getElementById('msgPanelBar').style.display="none";
   	window.close();
}

function showErrorMsg(msg){
	document.getElementById('msgPanelBar').style.display = "block";
	document.getElementById('msgPanelContent').innerHTML = msg;
}

function getUrlVars(url) {
    let vars = {};
    url.replace(/[?&]+([^=&]+)=([^&]*)/gi, function (m, key, value) {
        if (value === "true") value = true;
        if (value === "false") value = false;
        vars[key] = value;
    });
    return vars;
}

function detectmob() { 
    if( navigator.userAgent.match(/Android/i)
        || navigator.userAgent.match(/webOS/i)
        || navigator.userAgent.match(/iPhone/i)
        || navigator.userAgent.match(/iPad/i)
        || navigator.userAgent.match(/iPod/i)
        || navigator.userAgent.match(/BlackBerry/i)
        || navigator.userAgent.match(/Windows Phone/i)
    ){
        return "mobile";
    }
    else {
        return "desktop";
    }
};
