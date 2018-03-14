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
    xhr.onreadystatechange = function () {
        if (xhr.readyState == 4) {
            var result = JSON.parse(xhr.responseText);
            if (xhr.status === 200) {
                console.log(xhr.responseText);
            } else {
                user.logout();
                console.log('connect error', xhr.responseText);
            }
        }
    };
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
    xhr.onreadystatechange = function () {
        if (xhr.readyState == 4) {
            if (xhr.status === 200) {
                var result = JSON.parse(xhr.responseText);
                if (user.loggedIn) {
                    user.sendAllTabsToServer();
                }
            } else {
                user.logout();
            }
        }
    };
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
                console.log(result)
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

                } else {
                    user.logout();
                }
            }
        }
    };
    xhr.onerror = function () {
        user.logout();
    };
    xhr.send(JSON.stringify(tabObject));
}