const BASE_URL = 'https://www.closeyourtabs.com';
const COOKIE_NAME =  'connect.sid'; 

/**
* Calls when JS file loaded
*/
function init(){
    var logoutBtn = document.getElementById('log-out-button');
    var refreshBtn = document.getElementsByClassName('tab-view-option');
    checkUserLoginStatus();
    logoutBtn.addEventListener('click', logoutUser);
    refreshBtn[2].addEventListener('click', waitAndRemoveIcons);
    addWebpageDeleteMasterButton();
    setTimeout(removeOpenIconsOnWebpage, 100)
}

function waitAndRemoveIcons(){
    setTimeout(removeOpenIconsOnWebpage, 500)
}

/**
* Finds parent container and sends tab info to extension along with message type
*/
function extensionAction(className, messageType){

    if(event.target.parentElement.classList[1] === className || event.target.classList[1] === className){
        parent = event.target.closest('.tab-container') || event.target.closest('.list-tab-container');
        sendTabInfoToExtension(parent, messageType)
    }
}

/**
* Removes selected tabs from DB, window, and webpage
*/
function removeSelectedTabs(){
    var tabContainers = document.getElementsByClassName('tab-container');
    var selectedTabs = document.getElementsByClassName('tab-selected');
    if(tabContainers.length === selectedTabs.length){
        chrome.runtime.sendMessage({type: "createNewTab"});
    }
    for(var tab in selectedTabs){
        sendTabInfoToExtension(selectedTabs[tab], "removeTab");
    } 
}

/**
* Remove element from database and window
*@param {object} parent 
*/
function sendTabInfoToExtension(parent, messageType){
    if(typeof parent !== "object"){
        return; 
    }
    var window = parent.getAttribute('data-windowid');
    var index = parent.getAttribute('data-tabindex');
    var tabInfo = {};
    tabInfo['window'] = window;
    tabInfo['index'] = index; 
    chrome.runtime.sendMessage({type: messageType, data: tabInfo});
}

/**
* Calls extension to log out user 
*/
function logoutUser(){
    chrome.runtime.sendMessage({type: "logoutUser"});
}

/**
* Calls extension to check login status of user
*/
function checkUserLoginStatus(){
    chrome.runtime.sendMessage({type: "checkLogin"});
}

/**
* Loops through all tab DOM elements and removes open Icon and appends a new one
*/
function removeOpenIconsOnWebpage(){
    var openIcon = document.getElementsByClassName('open-favicon');
    while(openIcon.length){
        removeHighlightIconAndAddNew(openIcon[0]);
    }
}


/**
* Remove highlight icon from webpage and insert new one with extension event listener
*@param {object} icon 
*Call addDeleteBtn
*/
function removeHighlightIconAndAddNew(icon){
    var container = icon.closest('.tab-utilities-container');
    var newIcon = document.createElement('i');
    var iconContainer = document.createElement('div');
    iconContainer.classList.add('tab-utility', 'highlight-icon');
    icon.remove();
    newIcon.classList.add('fas', 'fa-external-link-alt');
    iconContainer.appendChild(newIcon);
    container.prepend(iconContainer);
    addDeleteBtn(container);
    iconContainer.addEventListener('click', extensionAction.bind(null, 'fa-external-link-alt', "highlightTab"));
}

/**
* Add delete button to webpage
*@param {object} container 
*/
function addDeleteBtn(container){
    var iconContainer = document.createElement("div")
    iconContainer.classList.add("tab-utility", "close-favicon");
    var closeTabIcon = document.createElement('i');
    closeTabIcon.classList.add('fas', 'fa-times');
    iconContainer.appendChild(closeTabIcon);
    container.appendChild(iconContainer);
    document.querySelector('.main-tab-area').addEventListener('click', extensionAction.bind(null, 'fa-times', 'removeTab'))

}

/**
* Add delete button to webpage sidebar 
*/
function addWebpageDeleteMasterButton(){
    var container = document.querySelector(".side-bar-container");
    var button = document.createElement('button');
    var text = document.createTextNode("DELETE");
    button.appendChild(text);
    button.addEventListener('click', removeSelectedTabs);
    container.prepend(button);
}

init();

