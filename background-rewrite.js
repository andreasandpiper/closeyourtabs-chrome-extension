var user;
const BASE_URL = 'http://www.closeyourtabs.com';
const COOKIE_NAME = 'connect.sid';

/**
 * User class keeps track of current tab information and logged in status
 */
class User {
    constructor() {
        this.loggedIn = false;
        this.tabsSortedByWindow = {};
        this.activeTabIndex = {};
        this.tabIds = {};
        this.name = '';
        this.photo = '';
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
                    console.log('user logged in');
                    user.loggedIn = true;
                    user.changeBrowserIcon('images/extension-green-logo.png');
                    clearPreviousTabData();
                    user.sendAllTabsToServer();
                } else {
                    console.log('user NOT logged in');
                    user.changeBrowserIcon('images/iconpurple.png');
                    user.loggedIn = false;
                }
            } else {
                console.log('user NOT logged in, no cookie');
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
                console.log('success logout');
                user.changeBrowserIcon('images/iconpurple.png')
                console.log(user)
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
            } else {
                console.log('fail logout')
            }
        })


    }
    sendAllTabsToServer() {
        for (var window in this.tabsSortedByWindow) {
            for (var tab in this.tabsSortedByWindow[window]) {
                var currentTab = this.tabsSortedByWindow[window][tab];
                createNewTabRequest(currentTab);
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
 * Remove tab and tab id from user, calls database to remove
 *@param {integer} id iD of tab removed
 *@param {object} removeInfo windowid
 */
chrome.tabs.onRemoved.addListener(function (id, removeInfo) {
    console.log('removed: ', removeInfo)
    removeTab(id, removeInfo.windowId)
})

/**

* Listens to for when a tab updates, updates information and sends info to database
*@param {integer} tab tab id
*@param {object} changeInfo changed info of the tab
*@param {object} tab  object containing props about the tab
*/
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (tab.url !== undefined && changeInfo.status == "complete") {
        console.log('updated: ', tab)
        if (user.tabIds[tab.windowId].indexOf(tab.id) === -1) {
            createNewTab(tab);
        }

    }
})


// chrome.tabs.onCreated.addListener(function (tab) {
//     createNewTab(tab);

// })




/**
 * Listens for when a tab becomes active by user clicking on the tab
 *@param {object} activeInfo includes props about the tab clicked
 *call setTime, createNewTab
 */
chrome.tabs.onHighlighted.addListener(function (hightlightInfo) {

    chrome.tabs.get(hightlightInfo.tabIds[0], function (tab) {
        updatePreviousActiveTab(tab.windowId);
        user.activeTabIndex[tab.windowId] = tab.index;
        console.log('highlighted: ', tab)
        var tabWindowArray = user.tabsSortedByWindow[window.id];
        if (user.tabIds[tab.windowId].indexOf(tab.id) === -1) {
            createNewTab(tab);
        }

    })
})



/**

* Listens to for when a tab moves in a window
*@param { integer } tabId id of tab moved
*@param { object } moveInfo fromIndex, toIndex, windowId
*/
chrome.tabs.onMoved.addListener(function (tabId, moveInfo) {
    console.log('moved: ', moveInfo)

})


/**
 * Listens for when a tab is detached from window 
 *@param {integer} tabId 
 *@param {object} detachInfo  oldPosition, oldWindowId
 */
chrome.tabs.onDetached.addListener(function (tabId, detachInfo) {
    console.log('detached: ', detachInfo)

})


/**
 * Listens for when a tab is attached to window 
 *@param {integer} tabId 
 *@param {object} detachInfo  newPosition, newWindowId
 */
chrome.tabs.onAttached.addListener(function (tabId, attachInfo) {
    console.log('attached: ', attachInfo)

})


/**
 * Listens for window created
 *@param {object} window
 *calls newWindowForUser
 */
chrome.windows.onCreated.addListener(function (window) {
    console.log('window created: ', window)
    createNewWindow(window.id);

});

/**
 * Listens for window removed
 *@param {object} windowId
 */
chrome.windows.onRemoved.addListener(function (windowId) {
    console.log('window removed: ', windowId)

});


/**
 * Runs function when first browser loads
 *@param {object} details
 *calls getAllTabs
 */
chrome.runtime.onStartup.addListener(function (details) {
    console.log('start up: ', details)
    createNewUser();
});

/**
 * Runs function when first installed
 *@param {object} details
 *calls getAllTabs
 */
chrome.runtime.onInstalled.addListener(function (details) {
    console.log('installed: ', details)
    createNewUser();
});

/**
 * Listens for when an open link even from the popup and only run content script in dashboard
 *@param {object} details
 */
chrome.webNavigation.onHistoryStateUpdated.addListener(function (details) {
    if (details.url === 'http://www.closeyourtabs.com/dashboard' || details.url === 'http://www.closeyourtabs.com/dashboard#') {
        chrome.tabs.executeScript(null, {
            file: "dashboard.js"
        });
    }
});

/**
 * Listens for messages from content script
 *@param {object} request
 *@param {object} sender
 *@param {function} sendResponse
 */
chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {});


/**
 * Runs function when receive a message from the shared port, (popup content script)
 *@param {object} port
 *@param {object} message
 * sends response back to the caller
 */
chrome.runtime.onConnect.addListener(function (port) {
    console.assert(port.name == 'tab');
    port.onMessage.addListener(function (message) {

    });
});


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
        activeTimeElapsed: 0,
        inactiveTimeElapsed: 0,
        screenshot: '',
        databaseTabID: '',
        highlighted: tab.highlighted
    }

    user.tabIds[tab.windowId].push(tab.id);

    if (tab.highlighted) {
        user.activeTabIndex[tab.windowId] = tab.index;
    }

    if (tab.index < tabWindowArray.length) {
        console.log('splice in')
        tabWindowArray.splice(tab.index, 0, tabObject);
        updateIndex(tab.index + 1, user.tabsSortedByWindow[tab.windowId].length, tab.windowId);
    } else {
        tabWindowArray.push(tabObject);
    }

}

function createNewUser() {
    user = new User();
    chrome.windows.getAll(function (windows) {
        windows.forEach(function (window) {
            createNewWindow(window.id);
        });
    });
    getAllTabs();
    // user.login();
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

function updatePreviousActiveTab(windowId) {
    var previousActiveIndex = user.activeTabIndex[windowId];
    if (previousActiveIndex === null) {
        return;
    }
    var allTabs = user.tabsSortedByWindow[windowId];
    allTabs[previousActiveIndex].highlighted = false;
    allTabs[previousActiveIndex].timeOfDeactivation = getTimeStamp();
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
    }
}

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
            } else {
                user.tabsSortedByWindow[windowId].pop();
            }
            break;
        }
    }
}