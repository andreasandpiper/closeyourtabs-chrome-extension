/**
 * Listens for messages from content script
 *@param {object} request
 *@param {object} sender
 *@param {function} sendResponse
 */
chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (request.type === "createNewTab"){
            chrome.tabs.create({url: BASE_URL});
        }else if (request.type === "checkLogin") {
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