var user;
const BASE_URL = 'https://www.closeyourtabs.com';
const COOKIE_NAME = 'connect.sid';
const alertInactiveTime = 180;

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
 * Runs function when first browser loads
 *@param {object} details
 *calls getAllTabs
 */
chrome.runtime.onStartup.addListener(function (details) {
    createNewUser();
});

/**
 * Runs function when first installed
 *@param {object} details
 *calls getAllTabs
 */
chrome.runtime.onInstalled.addListener(function (details) {
    createNewUser();
});

/**
 * Remove tab and tab id from user, calls database to remove
 *@param {integer} id iD of tab removed
 *@param {object} removeInfo windowid
 */
chrome.tabs.onRemoved.addListener(function (id, removeInfo) {
    removeTab(id, removeInfo.windowId);
})

/**
 * Listens to for when a tab updates, updates information and sends info to database
 *@param {integer} tab tab id
 *@param {object} changeInfo changed info of the tab
 *@param {object} tab  object containing props about the tab
 */
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (tab.url !== undefined && changeInfo.status == "complete") {
        updatedElaspedDeactivation();
        if (user.tabIds[tab.windowId].indexOf(tab.id) === -1) {
            var createdTab = createNewTab(tab);

            if (user.loggedIn) {
                var dataForServer = dataObjectForNewTab(createdTab);
                createNewTabRequest(dataForServer, createdTab.index);
            }
        } else {
            var updatedTab = updateTab(tab);
            if (user.loggedIn) {
                var dataForServer = dataObjectForUpdatedTab(updatedTab);
                sendDataToServer('PUT', `${BASE_URL}/tabs`, dataForServer);
            }
        }
    }
})

/**
 * Listens for when a tab becomes active by user clicking on the tab
 *@param {object} activeInfo includes props about the tab clicked
 *call setTime, createNewTab
 */
chrome.tabs.onHighlighted.addListener(function (hightlightInfo) {
    chrome.tabs.get(hightlightInfo.tabIds[0], function (tab) {
        updatedElaspedDeactivation();
        if (!user.tabsSortedByWindow[tab.windowId]) {
            return;
        }
        updatePreviousActiveTab(tab.windowId);
        user.activeTabIndex[tab.windowId] = tab.index;

        var tabWindowArray = user.tabsSortedByWindow[window.id];
        if (user.tabIds[tab.windowId].indexOf(tab.id) === -1) {
            chrome.tabs.captureVisibleTab({
                quality: 5
            }, function (dataUrl) {
                tab.screenshot = dataUrl;
                var createdTab = createNewTab(tab);

                if (user.loggedIn) {
                    var dataForServer = dataObjectForNewTab(createdTab);
                    createNewTabRequest(dataForServer, createdTab.index);
                }
            })
        } else if (user.tabsSortedByWindow[tab.windowId][tab.index]) {
            user.tabsSortedByWindow[tab.windowId][tab.index].highlighted = true;
            user.tabsSortedByWindow[tab.windowId][tab.index].timeOfDeactivation = 0;
            if (user.loggedIn) {
                activateTimeTab(user.tabsSortedByWindow[tab.windowId][tab.index].databaseTabID);
            }
        }
    })
})

/**
* Listens to for when a tab moves in a window
*@param { integer } tabId id of tab moved
*@param { object } moveInfo fromIndex, toIndex, windowId
*/
chrome.tabs.onMoved.addListener(function (tabId, moveInfo) {
    updatedElaspedDeactivation();
    var tab = user.tabsSortedByWindow[moveInfo.windowId][moveInfo.fromIndex];
    user.tabsSortedByWindow[moveInfo.windowId].splice(moveInfo.fromIndex, 1);
    user.tabsSortedByWindow[moveInfo.windowId].splice(moveInfo.toIndex, 0, tab);
    user.activeTabIndex[tab.windowId] = moveInfo.toIndex;
    if (user.loggedIn) {
        var dataForServer = dataObjectForUpdatedTab(user.tabsSortedByWindow[moveInfo.windowId][moveInfo.toIndex]);
        sendDataToServer('PUT', `${BASE_URL}/tabs`, dataForServer);
    }
    if (moveInfo.fromIndex > moveInfo.toIndex) {
        updateIndex(moveInfo.toIndex, moveInfo.fromIndex, moveInfo.windowId);
    } else {
        updateIndex(moveInfo.fromIndex, moveInfo.toIndex + 1, moveInfo.windowId);
    }
})


/**
 * Listens for when a tab is detached from window 
 *@param {integer} tabId 
 *@param {object} detachInfo  oldPosition, oldWindowId
 */
chrome.tabs.onDetached.addListener(function (tabId, detachInfo) {
    updatedElaspedDeactivation();
    var tab = user.tabsSortedByWindow[detachInfo.oldWindowId][detachInfo.oldPosition];
    var tabIDIndex = user.tabIds[detachInfo.oldWindowId].indexOf(tabId);
    user.tabIds[detachInfo.oldWindowId].splice(tabIDIndex, 1);
    user.tabsSortedByWindow[detachInfo.oldWindowId].splice(detachInfo.oldPosition, 1);
    if (user.activeTabIndex[detachInfo.oldWindowId] === detachInfo.oldPosition) {
        user.activeTabIndex[detachInfo.oldWindowId] = null;
    }
    if (user.loggedIn) {
        var tabObject = {};
        tabObject['databaseTabID'] = tab.databaseTabID;
        sendDataToServer('DELETE', `${BASE_URL}/tabs/database`, tabObject);
    }
    updateIndex(detachInfo.oldPosition, user.tabsSortedByWindow[detachInfo.oldWindowId].length, detachInfo.oldWindowId);
})

/**
 * Listens for window created
 *@param {object} window
 *calls newWindowForUser
 */
chrome.windows.onCreated.addListener(function (window) {
    createNewWindow(window.id);
});

/**
 * Listens for window removed
 *@param {object} windowId
 */
chrome.windows.onRemoved.addListener(function (windowId) {
    updatedElaspedDeactivation();
    delete user.tabsSortedByWindow[windowId];
    delete user.activeTabIndex[windowId];
    delete user.tabIds[windowId];
});

/**
 * Runs function when first browser loads
 *@param {object} details
 *calls getAllTabs
 */
chrome.runtime.onStartup.addListener(function (details) {
    createNewUser();
});

/**
 * Runs function when first installed
 *@param {object} details
 *calls getAllTabs
 */
chrome.runtime.onInstalled.addListener(function (details) {
    createNewUser();
});

/**
 * Listens for when an open link even from the popup and only run content script in dashboard
 *@param {object} details
 */
chrome.webNavigation.onCompleted.addListener(function (details) {
    if (details.url === 'https://www.closeyourtabs.com/dashboard' || details.url === 'https://www.closeyourtabs.com/dashboard#') {
        chrome.tabs.executeScript(null, {
            file: "js/dashboard.js",
            runAt: "document_end"
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
    function (request, sender, sendResponse) {
        if (request.type === "checkLogin") {
            if (!user.loggedIn) {
                user.login();
            }
        } else if (request.type == "removeTab") {
            var window = request.data.window;
            var index = request.data.index;
            var tabID = user.tabsSortedByWindow[window][index].id;
            if (tabID >= 0) {
                chrome.tabs.remove(tabID);
                sendResponse({
                    success: true
                })
            } else {
                sendResponse({
                    success: false
                })
            }

        } else if (request.type == "logoutUser") {
            if (user.loggedIn) {
                user.logout();
            }
        } else if (request.type === "checkLogin") {
            if (!user.loggedIn) {
                user.login();
            }
        }else if (request.type === 'highlightTab') {
            chrome.tabs.highlight({
                tabs: parseInt(request.data.index),
                windowId: parseInt(request.data.window)
            });
            chrome.windows.update(parseInt(request.data.window), {
                focused: true
            });
        } 
    });


/**
 * Runs function when receive a message from the shared port, (popup content script)
 *@param {object} port
 *@param {object} message
 * sends response back to the caller
 */
chrome.runtime.onConnect.addListener(function (port) {
    console.assert(port.name == 'tab');
    port.onMessage.addListener(function (message) {
        if (message.type == 'popup') {
            updatedElaspedDeactivation();
            var responseObject = {};
            responseObject.userStatus = user.loggedIn;
            responseObject.allTabs = user.tabsSortedByWindow;
            chrome.windows.getAll(function (window) {
                for (let array = 0; array < window.length; array++) {
                    if (window[array].focused === true) {
                        responseObject.currentWindow = window[array].id;
                        lastFocused = window[array].id;
                    }
                }
                port.postMessage({
                    sessionInfo: responseObject
                });
            })
        } else if (message.type === 'refresh') {
            updatedElaspedDeactivation();
            chrome.windows.getLastFocused(function (window) {
                var responseObject = {};
                responseObject.userStatus = user.loggedIn;
                responseObject.allTabs = user.tabsSortedByWindow;
                responseObject.currentWindow = lastFocused;
                port.postMessage({
                    sessionInfo: responseObject
                });
            })
        } else if (message.type === 'logout') {
            user.logout();
        }
    });
});

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
    if(user){
        return;
    }
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
 * Listens for messages from content script
 *@param {object} request
 *@param {object} sender
 *@param {function} sendResponse
 */
chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (request.type === "checkLogin") {
            if (!user.loggedIn) {
                user.login();
            }
        } else if (request.type === "removeTab") {
            var window = request.data.window;
            var index = request.data.index;
            var tabID = user.tabsSortedByWindow[window][index].id;
            if (tabID >= 0) {
                chrome.tabs.remove(tabID);
                sendResponse({
                    success: true
                })
            } else {
                sendResponse({
                    success: false
                })
            }
        } else if (request.type === "logoutUser") {
            if (user.loggedIn) {
                user.logout();
            }
        } else if (request.type === "checkLogin") {
            if (!user.loggedIn) {
                user.login();
            }
        } else if (request.type === 'highlightTab') {
            chrome.tabs.highlight({
                tabs: parseInt(request.data.index),
                windowId: parseInt(request.data.window)
            });
            chrome.windows.update(parseInt(request.data.window), {
                focused: true
            });
        } 
    });


/**
 * Runs function when receive a message from the shared port, (popup content script)
 *@param {object} port
 *@param {object} message
 * sends response back to the caller
 */
chrome.runtime.onConnect.addListener(function (port) {
    console.assert(port.name == 'tab');
    port.onMessage.addListener(function (message) {
        var responseObject = {};
        responseObject.userStatus = user.loggedIn;

        if (message.type == 'popup') {
            chrome.windows.getAll(function (window) {
                for (let array = 0; array < window.length; array++) {
                    if (window[array].focused === true) {
                        responseObject.currentWindow = window[array].id;
                        lastFocused = window[array].id;
                    }
                }
                if (user.loggedIn) {
                    port.postMessage({
                        sessionInfo: responseObject
                    });
                    getAllTabsFromServer().then(resp => {
                        responseObject.allTabs = sortTabsIntoWindows(resp.data)

                        port.postMessage({
                            sessionInfo: responseObject
                        });

                    }).catch(err => {
                        console.log(err)
                    })
                } else {
                    updatedElaspedDeactivation();
                    responseObject.allTabs = user.tabsSortedByWindow;

                    port.postMessage({
                        sessionInfo: responseObject
                    });
                }
            })
        } else if (message.type === 'refresh') {
            updatedElaspedDeactivation();
            chrome.windows.getLastFocused(function (window) {
                responseObject.allTabs = user.tabsSortedByWindow;
                responseObject.currentWindow = lastFocused;
                port.postMessage({
                    sessionInfo: responseObject
                });
            })
        } else if (message.type === 'logout') {
            user.logout();
        } else if (message.type === 'clear-data') {
            createNewUser();
            port.postMessage({
                newData: true
            })
        } else if (message.type === 'setBadge') {
            setBadgeNumber(message.number);
        }
    });
});

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

/**
 * Get request to receive all tabs of user from database
 */
function getAllTabsFromServer() {
    return new Promise((resolve, reject) => {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', `${BASE_URL}/tabs`, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState == 4) {
                if (xhr.status === 200) {
                    var result = JSON.parse(xhr.responseText);
                    resolve(result)
                } else {
                    user.logout();
                    reject(xhr.responseText)
                }
            }
        };
        xhr.onerror = function () {
            user.logout();
            reject()

        };
        xhr.send();
    })
}

/**
 * basic request to server in which the return callback does not need to do anything
 *@param {string} method types of request, ex. get, post, etc
 *@param {string} action the target route on the server
 *@param {object} data the data that will be sent
 */
function sendDataToServer(method, action, data) {
    if (data === null) {
        return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open(method, action);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onerror = function () {
        user.logout();
    };
    xhr.send(JSON.stringify(data));
}

/**
 * Delete all user tab information from the database
 */
function requestToServerNoData(method, route) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, route, true);
    xhr.onerror = function () {
        user.logout();
    };
    xhr.send();
}


/**
 * POST request for new tab, saves tabId to user, activates tab when completed
 *@param {object} tabObject the data that will be sent
 */
function createNewTabRequest(tabObject, index) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}/tabs`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
        if (xhr.readyState == 4) {
            if (xhr.status === 200) {
                var result = JSON.parse(xhr.responseText)
                if (result.success) {
                    var result = JSON.parse(xhr.responseText).data.insertId;
                    var tabObj = user.tabsSortedByWindow[tabObject.windowID][index];
                    user.tabsSortedByWindow[tabObject.windowID][index] = { ...tabObj,
                        databaseTabID: result
                    };
                    if (tabObj.highlighted) {
                        activateTimeTab(result);
                    } else {
                        deactivateTimeTab(result)
                    }
                }
            }
        }
    };
    xhr.onerror = function () {
        user.logout();
    };
    xhr.send(JSON.stringify(tabObject));
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
        screenshot: '' 
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
        screenshot: '' 
    }
    return dataForServer;
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

if(!user){
    createNewUser();
}