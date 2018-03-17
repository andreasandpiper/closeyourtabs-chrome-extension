var user;
const BASE_URL = 'https://www.closeyourtabs.com';
const COOKIE_NAME = 'connect.sid';
var alertInactiveTime = 180;

/**
 * User class keeps track of current tab information and logged in status
 */
class User {
    constructor() {
        this.loggedIn = false;
        this.tabsSortedByWindow = {};
        this.activeTabIndex = {};
        this.tabIds = {};
        this.detachedTabInfo = {
            uniqueId: null
        };
    }
    login() {
        if (user.loggedIn) {
            return;
        }
        chrome.cookies.get({
            url: BASE_URL,
            name: COOKIE_NAME
        }, function (cookie) {
            if (cookie) {
                var date = new Date();
                var currenttime = date.getTime();
                var ifExpire = currenttime - cookie.expirationDate;
                if (ifExpire > 0) {
                    user.loggedIn = true;
                    user.changeBrowserIcon('images/extension-green-logo.png');
                    clearPreviousTabData();
                } else {
                    user.changeBrowserIcon('images/iconpurple.png');
                    user.loggedIn = false;
                }
            } else {
                user.changeBrowserIcon('images/iconpurple.png');
                user.loggedIn = false;
            }
        });
    }
    logout() {
        chrome.cookies.remove({
            url: BASE_URL,
            name: COOKIE_NAME
        }, function (result) {
            if (result.name === COOKIE_NAME) {
                user.changeBrowserIcon('images/iconpurple.png')
                if (user.loggedIn) {
                    clearPreviousTabData();
                    user.loggedIn = false;
                    for (var window in user.tabsSortedByWindow) {
                        for (var tab in user.tabsSortedByWindow[window]) {
                            var matchedTab = user.tabsSortedByWindow[window][tab];
                            let domain = (matchedTab.url).match(/closeyourtabs.com/gi)
                            if (domain) {
                                chrome.tabs.reload(matchedTab.id);
                            }
                        }
                    }

                }
            }
        })
    }
    sendAllTabsToServer() {
        for (var window in this.tabsSortedByWindow) {
            for (var tab in this.tabsSortedByWindow[window]) {
                var currentTab = this.tabsSortedByWindow[window][tab];
                var dataForServer = dataObjectForNewTab(currentTab);
                createNewTabRequest(dataForServer, currentTab.index);
            }
        }
    }
    changeBrowserIcon(imagePath) {
        chrome.browserAction.setIcon({
            path: imagePath
        })
    }
}


/**
 * Creates a new window in User Class
 *@param {integer} windowId 
 */
function createNewWindow(windowId) {
    user.tabsSortedByWindow[windowId] = [];
    user.tabIds[windowId] = [];
    user.activeTabIndex[windowId] = null;
}

/**
 * Creates a Tab object, if highlighted sets time of activation
 * Checks to see if tab is occupying spot to place new tab
 *@param {object} tab 
 *@param {object} currentTime
 */
function createNewTab(tab) {
    var tabWindowArray = user.tabsSortedByWindow[tab.windowId];
    var tabObject = {
        id: tab.id,
        windowId: tab.windowId,
        favicon: tab.favIconUrl,
        title: tab.title,
        url: tab.url,
        index: tab.index,
        screenshot: tab.screenshot || '',
        databaseTabID: '',
        highlighted: tab.highlighted
    }

    user.tabIds[tab.windowId].push(tab.id);

    if (tab.highlighted) {
        user.activeTabIndex[tab.windowId] = tab.index;
        tabObject.timeOfDeactivation = 0;
    } else {
        tabObject.timeOfDeactivation = getTimeStamp();
    }

    if (tab.index < tabWindowArray.length) {
        tabWindowArray.splice(tab.index, 0, tabObject);
        updateIndex(tab.index + 1, user.tabsSortedByWindow[tab.windowId].length, tab.windowId);
    } else {
        tabWindowArray.push(tabObject);
    }

    return tabObject;
}


/**
 * Updates a Tab object and returns an object to send to server 
 *@param {object} tab 
 *@return {object} dataForServer
 */
function updateTab(tab) {
    //if the site changed, get the elapsed time during active state and save to its url
    var currentInfo = user.tabsSortedByWindow[tab.windowId][tab.index];
    if (currentInfo.screenshot && tab.screenshot === '') {
        tab.screenshot = currentInfo.screenshot;
    }
    var updatedInfo = { ...currentInfo,
        id: tab.id,
        windowId: tab.windowId,
        favicon: tab.favIconUrl,
        title: tab.title,
        url: tab.url,
        screenshot: tab.screenshot,
        index: tab.index,
        highlighted: tab.highlighted
    }

    user.tabsSortedByWindow[tab.windowId][tab.index] = updatedInfo;

    return updatedInfo;
}

/**
 * Creates new instance of User
 */
function createNewUser() {
    user = new User();
    chrome.windows.getAll(function (windows) {
        windows.forEach(function (window) {
            createNewWindow(window.id);
        });
    });
    getAllTabs();
    user.login();
}

/**
 * Gets all tabs currently in the browser
 *calls createNewTab
 */
function getAllTabs() {
    chrome.tabs.query({}, function (tabs) {
        var date = new Date();
        var timeStamp = date.getTime();
        tabs.forEach(function (tab) {
            createNewTab(tab, timeStamp);
        });
    });
}

/**
 * Updates the previous active tab info in User. Sets a new time of deactivation
 *@param {integer} windowId 
 */
function updatePreviousActiveTab(windowId) {
    var previousActiveIndex = user.activeTabIndex[windowId];
    if (previousActiveIndex === null) {
        return;
    }
    var allTabs = user.tabsSortedByWindow[windowId];
    allTabs[previousActiveIndex].highlighted = false;
    allTabs[previousActiveIndex].timeOfDeactivation = getTimeStamp();
    if (user.loggedIn) {
        deactivateTimeTab(allTabs[previousActiveIndex].databaseTabID);

    }
}

/**
 *Returns current time stamp
 */
function getTimeStamp() {
    var date = new Date()
    return date.getTime();
}


/**
 *updated index by 1 from beginning to ending index
 *@param {integer} beginIndex
 *@param {integer} endIndex
 */
function updateIndex(beginIndex, endIndex, windowID) {

    for (var index = beginIndex; index < endIndex; index++) {
        user.tabsSortedByWindow[windowID][index].index = index;

        if (user.tabsSortedByWindow[windowID][index].highlighted) {
            user.activeTabIndex[windowID] = index;
        }

        if (user.loggedIn) {
            var dataForServer = dataObjectForUpdatedTab(user.tabsSortedByWindow[windowID][index]);
            sendDataToServer('PUT', `${BASE_URL}/tabs`, dataForServer);
        }
    }
}

/**
 *removes tab from User arrays and deletes from database
 *@param {integer} id
 *@param {integer} windowId
 */
function removeTab(id, windowId) {
    var tabArray = user.tabsSortedByWindow[windowId];
    for (var tabIndex = 0; tabIndex < tabArray.length; tabIndex++) {
        if (tabArray[tabIndex].id === id) {
            var tabToRemoveInfo = user.tabsSortedByWindow[windowId][tabIndex];
            var indexOfId = user.tabIds[windowId].indexOf(tabToRemoveInfo.id);
            user.tabIds[windowId].splice(indexOfId, 1);
            user.tabsSortedByWindow[windowId].splice(tabIndex, 1);

            if (tabToRemoveInfo.highlighted) {
                user.activeTabIndex[windowId] = null;
            }

            if (tabIndex < tabArray.length) {
                updateIndex(tabIndex, tabArray.length, windowId)
            }

            if (user.loggedIn) {
                var tabObject = {};
                tabObject['databaseTabID'] = tabToRemoveInfo.databaseTabID;
                sendDataToServer('DELETE', `${BASE_URL}/tabs/database`, tabObject);
            }

            break;
        }
    }
}

/**
 *Checks elapsed deactivate time and updates the elapsed deactivated time
 *
 */
function updatedElaspedDeactivation() {
    var currentTime = getTimeStamp();
    var windows = user.tabsSortedByWindow;
    var overdueTabCount = 0; 
    for (var window in windows) {
        for (var index in windows[window]) {
            tab = windows[window][index];
            if (!tab.highlighted) {
                tab.inactiveTimeElapsed =
                    currentTime - tab.timeOfDeactivation;
                let timeElapsed = tab.inactiveTimeElapsed / 60000; 
                if(timeElapsed > alertInactiveTime){
                    overdueTabCount++;
                }
            } else {
                tab.inactiveTimeElapsed = 0;
            }
        }
    }
    setBadgeNumber(overdueTabCount);
}

/**
 * Sets new badge number on extension icon
 *@param {integer} number
 */
function setBadgeNumber(number) {
    if (number > 0) {
        chrome.browserAction.setBadgeText({
            text: number.toString()
        });
        chrome.browserAction.setBadgeBackgroundColor({
            color: '#FF0000'
        });
    } else {
        chrome.browserAction.setBadgeText({
            text: ''
        });
    }
}

/**
 *Deletes user information from database
 */
function clearPreviousTabData() {
    requestToServerNoData('DELETE', `${BASE_URL}/tabs/google`);
}
/**
 * Calls database to activate the time for tab
 *@param {integer} uniqueID
 *call sendDataToServer
 */
function activateTimeTab(uniqueID) {
    var tabObject = {};
    tabObject['databaseTabID'] = uniqueID;
    sendDataToServer('PUT', `${BASE_URL}/tabs/activatedTime`, tabObject);
}

/**
 * Calls database to deactivate the time for tab
 *@param {integer} uniqueID 
 *call sendDataToServer
 */
function deactivateTimeTab(uniqueID) {
    if (uniqueID !== null) {
        var tabObject = {};
        tabObject['databaseTabID'] = uniqueID;
        sendDataToServer('PUT', `${BASE_URL}/tabs/deactivatedTime`, tabObject)
    }
}

/**
 * sorts array of tabs into an object of windows
 *@param {array} array 
 *@returns {object}
 */
function sortTabsIntoWindows(array) {
    var windows = {}

    array.forEach(function (tab) {
        var newTab = {};

        newTab.inactiveTimeElapsed = tab.currentTime - tab.deactivatedTime;
        newTab.highlighted = user.tabsSortedByWindow[tab.windowID][tab.browserTabIndex].highlighted;
        newTab.favicon = user.tabsSortedByWindow[tab.windowID][tab.browserTabIndex].favicon;
        newTab.url = tab.url;
        newTab.windowId = tab.windowID;
        newTab.title = tab.tabTitle;
        newTab.index = tab.browserTabIndex;
        newTab.id = user.tabsSortedByWindow[tab.windowID][tab.browserTabIndex].id;

        if (windows[tab.windowID]) {
            windows[tab.windowID].push(newTab)
        } else {
            windows[tab.windowID] = [newTab]
        }
    })

    for (var window in windows) {
        windows[window] = windows[window].sort(function (a, b) {
            return a.browserTabIndex - b.browserTabIndex;
        })
    }
    return windows
}

/**
 * Creates data object to send to server to CREATE a new tab
 *@param {object} tab the data that will be sent
 */
function dataObjectForNewTab(tab) {
    var dataForServer = {
        windowID: tab.windowId,
        tabTitle: tab.title,
        activatedTime: 0,
        deactivatedTime: 0,
        browserTabIndex: tab.index,
        url: tab.url,
        favicon: tab.favIconUrl,
        screenshot: tab.screenshot
    };
    return dataForServer;
}

/**
 * Creates data object to send to server to UPDATE a previous tab
 *@param {object} tab the data that will be sent
 */
function dataObjectForUpdatedTab(tab) {
    var dataForServer = {
        databaseTabID: tab.databaseTabID,
        tabTitle: tab.title,
        browserTabIndex: tab.index,
        url: tab.url,
        favicon: tab.favicon,
        screenshot: tab.screenshot
    }
    return dataForServer;
}


function init(){
    if(!user){
        createNewUser();
    }
}

init();
