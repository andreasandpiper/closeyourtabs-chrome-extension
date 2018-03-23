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
    var object = {
        url: BASE_URL,
        name: "extension_version",
        value: VERSION
    }
    chrome.cookies.set(object)
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
        chrome.tabs.captureVisibleTab({
            quality: 5
        }, function (dataUrl) {
            tab.screenshot = dataUrl;
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
        })
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