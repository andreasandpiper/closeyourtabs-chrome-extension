var lengthOfString = 40;
var port = chrome.runtime.connect({
	name: 'tab'
});
var inactiveTabCount = 0;
var yellowInactiveTime = 60000;
var redInactiveTime = 180000;

/**
 * Function called on page load, sets click handlers to DOM, get all the data from extension
 */
var redoBtn = document.getElementsByClassName('fa-exclamation-triangle')[0]; 
document.getElementById('refresh').addEventListener('click', refreshContent);
document.getElementById('logout').addEventListener('click', logoutUser);
redoBtn.addEventListener('click', getAllNewTabData);
redoBtn.addEventListener('mouseover', showAlertMessage.bind(null, ".redo-tabs p"));
redoBtn.addEventListener('mouseout', hideAlertMessage.bind(null, ".redo-tabs p"));
document.getElementById("refresh").addEventListener('mouseover', showAlertMessage.bind(null, ".user-tools p"));
document.getElementById("refresh").addEventListener('mouseout', hideAlertMessage.bind(null, ".user-tools p"));
/**
 * Port messaging between script and extension, catches response from extension 
 * If response is array of data, render all tabs to dom
 *@param {object} response 
 */
port.onMessage.addListener(function (response) {
	if (response.sessionInfo) {
		document.getElementById('tag-titles').innerHTML = '';
		var windows = response.sessionInfo.allTabs;
		for (var window in windows) {
			var windowTabContainer = document.createElement('div');
			windowTabContainer.classList.add('window');

			for (var item in windows[window]) {
				var tabInfo = windows[window][item];
				var tabElement = createDomElement(tabInfo);
				windowTabContainer.appendChild(tabElement);
				if (tabInfo.inactiveTimeElapsed > 25000) {
					inactiveTabCount++;
				}
			}
			if (response.sessionInfo.userStatus) {
				hideLoginButtons();
			}

			if (window == response.sessionInfo.currentWindow) {
				document.getElementById('tag-titles').prepend(windowTabContainer);
			} else {
				document.getElementById('tag-titles').appendChild(windowTabContainer);
			}

		}
		setBadge(inactiveTabCount);
	} else if (response.loginStatus) {
		hideLoginButtons();
	} else if (response.newData){
		showLoadingMessage();
		setTimeout(sendMessageToGetTabInfo(), 500);
	}
});

/**
 * Create and return a DOM element for a tab
 *@param {object} tabObject 
 */
function createDomElement(tabObject) {
	if (!tabObject.title) {
		return;
	}
	if (tabObject.highlighted) {
		tabObject.color = 'activetab';
	} else if (tabObject.inactiveTimeElapsed < 10000) {
		tabObject.color = 'green';
	} else if (tabObject.inactiveTimeElapsed < 25000) {
		tabObject.color = 'yellow';
	} else {
		tabObject.color = 'red';
	}

	//Create tab container
	var tab = document.createElement('div');
	tab.className = 'tab-container id' + tabObject.id + ' ' + tabObject.color;

	//trashcan element
	var trashcanContainer = document.createElement('div');
	var trashcan = document.createElement('i');
	trashcan.classList.add('far','fa-trash-alt');
	trashcanContainer.classList.add('trashcan-container');
	trashcanContainer.appendChild(trashcan);

	//Create div to contain favicon and title
	var tabInformation = document.createElement('div');
	tabInformation.classList.add('tab-information');

	//favicon element
	var favicon = document.createElement('div');
	var faviconImage = document.createElement('img');
	favicon.classList.add('favicon-container');
	faviconImage.src = tabObject.favicon || 'images/iconpurple.png';
	favicon.appendChild(faviconImage);


	//title element
	var title = document.createElement('div');
	var addText = document.createTextNode(tabObject.title.substring(0, lengthOfString));
	title.classList.add('title-container');
	title.appendChild(addText);

	//Append elements to tab container
	tab.appendChild(trashcanContainer);
	tab.appendChild(favicon);
	tab.append(title);
	trashcan.addEventListener('click', removeThisTab.bind(this, tabObject.id));
	tab.addEventListener('click', highlightTab.bind(this, tabObject.index, tabObject.windowId));

	return tab;
}


/**
 * Set new number in badge in icon
 *@param {integer} number 
 */
function setBadge(number) {
	port.postMessage({
		type: 'setBadge',
		number: number
	});
}

/**
 * Removes tab from dom
 *@param {integer} number 
 *@param {object} event
 */
function removeThisTab(id, event) {
	chrome.tabs.remove(id);
	var elem = document.querySelector('.id' + id);
	elem.parentNode.removeChild(elem);
	inactiveTabCount--;
	setBadge(inactiveTabCount);
}

/**
 * Send message to extension to get pop up info
 */
function sendMessageToGetTabInfo() {
	port.postMessage({
		type: 'popup'
	});
}

/**
 * Hide login buttons when used logs in 
 */
function hideLoginButtons() {
	document.getElementById("logout").style.display = "block";
	document.getElementById("login").style.display = "none";
}


/**
 * removes all tabs in dom and sends message to extension to get new tab info
 */
function refreshContent() {
	document.getElementById('tag-titles').innerHTML = '';
	inactiveTabCount = 0;
	port.postMessage({
		type: 'refresh'
	});
}


/**
 * window will focus the tab that was clicked
 *@param {integer} index
 *@param {integer} windowId
 *@param {object} event
 */
function highlightTab(index, windowId, event) {
	chrome.tabs.highlight({
		tabs: index,
		windowId: windowId
	});
	chrome.windows.update(windowId, {
		focused: true
	});
}

function getAllNewTabData(){ 
	port.postMessage({type: 'clear-data'})
}

/**
 * calls extension to log out user an removes logout btn
 */
function logoutUser() {
	port.postMessage({
		type: 'logout'
	});
	document.getElementById('logout').style.display = 'none';
	document.getElementById('login').style.display = 'block';
}

function showAlertMessage(className){
	document.querySelector(className).classList.remove('hidden');
}

function hideAlertMessage(className){
	document.querySelector(className).classList.add('hidden');
}

function showLoadingMessage(){
	var container = document.getElementById('tag-titles');
	var div = document.createElement('div').id = 'loading message';
	var image = document.createElement('img');
	image.src = "images/loading.gif";
	image.alt = 'loading';
	var text = document.createElement('p');
	text.createTextNode("If you don't see your tabs, click refresh!")
	div.appendChild(image);
	div.appendChild(text);
	container.appendChild(div);
}



//this is a solution to a Mac issue with extension. Macs animate the extension open, so not having a set width can result in the window not having enough height to show the content
//found this solution at https://bugs.chromium.org/p/chromium/issues/detail?id=428044 
document.body.style.opacity = 0;
document.body.style.transition = 'opacity ease-out .4s';

requestAnimationFrame(function () {
	document.body.style.opacity = 1;
});

//End of Code

sendMessageToGetTabInfo();