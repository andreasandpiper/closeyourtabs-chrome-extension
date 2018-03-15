const BASE_URL = 'https://www.closeyourtabs.com';
const COOKIE_NAME =  'connect.sid'; 

/**
* Calls when JS file loaded
*/
function init(){
    var logoutBtn = document.getElementById('log-out-button');
    var deleteBtn = document.getElementsByClassName('sidebar-delete');
    checkUserLoginStatus();
    logoutBtn.addEventListener('click', logoutUser);
    deleteBtn[0].addEventListener('click', removeSelectedTabs);
    setTimeout(function(){addClickHandlersToTabs()}, 800);
    console.log('content script loaded');
}

/**
* Add click handler to each tab container on webpage
*/
function addClickHandlersToTabs(){
    removeOpenIconOnWebpage();
    var closeBtn = document.getElementsByClassName("close-favicon");
    for(var index = 0; index < closeBtn.length ; index++ ){
        document.querySelector('.main-tab-area').addEventListener('click', removeSingleTab)
    }
}

/**
* Event when X clicked on tab container and calls remove Element
*@param {object} event 
*/
function removeSingleTab(event){
    if(event.target.parentElement.classList[1] === 'fa-times' || event.target.classList[1] === 'fa-times'){
        var parent = event.target.closest('.tab-container') || event.target.closest('.list-tab-container');
        removeElement(parent);
    }
}

/**
* Removes selected tabs from DB, window, and webpage
*/
function removeSelectedTabs(){
    var tabContainers = document.getElementsByClassName('tab-container');
    for(var tab = 0; tab < tabContainers.length; tab++){

        var parent = tabContainers[tab];
        var descendents = parent.childNodes;
        var title = descendents[1].childNodes[0].innerText;
        let domain = (title).match(/close your tabs/gi);
        var classes = tabContainers[tab].className.split(" ");
        if(!domain && classes.indexOf('tab-selected') !== -1){
            removeElement(tabContainers[tab]);
        }
    }
}

/**
* Remove element from database and window
*@param {object} parent 
*/
function removeElement(parent){
    if(!parent){
        return; 
    }
    var window = parent.getAttribute('data-windowid');
    var index = parent.getAttribute('data-tabindex');
    var tabInfo = {};
    tabInfo['window'] = window;
    tabInfo['index'] = index; 
    chrome.runtime.sendMessage({type: "removeTab", data: tabInfo});
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

function removeOpenIconOnWebpage(){
    var openIcon = document.getElementsByClassName('open-favicon');
    console.log(openIcon)
    while(openIcon.length){
        var icon = openIcon[0];
        var container = icon.closest('.tab-utilities-container');
        var newIcon = document.createElement('i');
        var iconContainer = document.createElement('div');
        iconContainer.classList.add('tab-utility', 'highlight-icon');
        icon.remove();
        newIcon.classList.add('fas', 'fa-external-link-alt');
        iconContainer.appendChild(newIcon);
        container.prepend(iconContainer);
        iconContainer.addEventListener('click', extensionAction);
    }
}

function extensionAction(){
    var parent = null; 
    if(event.target.parentElement.classList[1] === 'fa-external-link-alt' || event.target.classList[1] === 'fa-external-link-alt'){
        parent = event.target.closest('.tab-container') || event.target.closest('.list-tab-container');
    }


    if(!parent){
        return; 
    }
    var window = parent.getAttribute('data-windowid');
    var index = parent.getAttribute('data-tabindex');
    var tabInfo = {};
    tabInfo['window'] = window;
    tabInfo['index'] = index; 
    console.log(tabInfo)
    chrome.runtime.sendMessage({type: "highlightTab", data: tabInfo});
}

init();


