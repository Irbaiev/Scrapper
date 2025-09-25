/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

var __assign = function() {
    __assign = Object.assign || function __assign(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function __generator(thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
}

/**
 * @internal
 */
var _configuration = {};
/**
 * Get the current configuration
 * @returns Active configuration, a combination of what the game has sent with [[configure]] and what the operator
 * environment supports.
 */
var getConfiguration = function () {
    return _configuration;
};
var getTargetOrigin = function () {
    var _a, _b;
    if (_configuration.clientConfig) {
        return (_a = _configuration.clientConfig.targetOrigin) !== null && _a !== void 0 ? _a : "*";
    }
    if (_configuration.p2pConfig) {
        return (_b = _configuration.p2pConfig.targetOrigin) !== null && _b !== void 0 ? _b : "*";
    }
    // This will throw an error, but it's OK - getTargetOrigin should never be called before we have received config
    return "-";
};
/**
 *
 * @returns True if targetOrigin is configured (if set)
 */
var isTargetOriginReceived = function () {
    return _configuration.clientConfig !== undefined || _configuration.p2pConfig !== undefined;
};
var isHandshakeDone = function () {
    return _configuration.operatorHandlesErrors !== undefined;
};

/**
 * Get search parameters from a string.
 * Values are not converted, they are always strings.
 * Keys that exist but have no value, such as `&debug&`, have their values set to `"true"`.
 * @param search Source string
 */
var getParameters = function (search) {
    if (search === "") {
        return {};
    }
    var hashes = search.slice(search.indexOf("?") + 1)
        .split("&");
    return hashes.reduce(function (params, hash) {
        var _a, _b;
        var split = hash.indexOf("=");
        if (split < 0) {
            return __assign(__assign({}, params), (_a = {}, _a[hash] = "true", _a));
        }
        var key = hash.slice(0, split);
        var val = hash.slice(split + 1);
        return __assign(__assign({}, params), (_b = {}, _b[key] = decodeURIComponent(val), _b));
    }, {});
};
var parameters = getParameters(window.location.search);
/**
 * Get a window query parameter value.
 * Returns the string `"true"` if the parameter is present but has no value, e.g. `?view=1&iamtrue&something=else`
 * Returns undefined if the parameter is not present.
 *
 * Aliases for the default parameters can be mapped with p2pConfig launchParams.
 * @param key Name of the key
 */
var getWindowParameter = function (key) {
    var _a, _b;
    if (parameters[key] !== undefined) {
        return parameters[key];
    }
    // Some parameters are read by FEIM before the game can send any aliases.
    // For this reason launchParams will not work with the rciframe system, for example.
    var keyAlias = (_b = (_a = getConfiguration().p2pConfig) === null || _a === void 0 ? void 0 : _a.launchParams) === null || _b === void 0 ? void 0 : _b[key];
    if (keyAlias !== undefined) {
        return parameters[keyAlias];
    }
    return undefined;
};
/**
 * Returns true if a parameter exists
 * @param key Name of the key
 */
var hasWindowParameter = function (key) {
    return Object.prototype.hasOwnProperty.call(parameters, key);
};

var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["NONE"] = 0] = "NONE";
    /**
     * Only log errors
     */
    LogLevel[LogLevel["ERROR"] = 1] = "ERROR";
    /**
     * Errors and warnings
     */
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    /**
     * Errors, warnings, and the module init process handler registrations
     */
    LogLevel[LogLevel["INIT"] = 3] = "INIT";
    /**
     * Log everything, including the sent and received messages
     */
    LogLevel[LogLevel["ALL_MESSAGES"] = 4] = "ALL_MESSAGES";
    /**
     * Also log message payloads
     */
    LogLevel[LogLevel["ALL_MESSAGES_AND_PAYLOADS"] = 5] = "ALL_MESSAGES_AND_PAYLOADS";
})(LogLevel || (LogLevel = {}));
var forceAllLogs = hasWindowParameter("rlxfeimdebug");
var logLevel = LogLevel.ERROR;
if (forceAllLogs) {
    logLevel = LogLevel.ALL_MESSAGES_AND_PAYLOADS;
}
var getStyle = function (level) {
    if (level <= LogLevel.INIT) {
        return "color: #000; background: #a0ecff; padding: 2px 6px; border: 1px solid #888";
    }
    return "color: #000; background: #d9e3e6; padding: 2px 6px;";
};
var debugLog = function (message) {
    if (forceAllLogs) {
        window.rlxfeim.log.push(message);
    }
};
var setLogLevel = function (value) {
    if (!forceAllLogs && value !== undefined) {
        logLevel = value;
    }
};
var log = function (message, level, data) {
    if (level === void 0) { level = LogLevel.ALL_MESSAGES; }
    if (logLevel >= level) {
        if (data !== undefined
            && (logLevel >= LogLevel.ALL_MESSAGES_AND_PAYLOADS || level <= LogLevel.INIT)) {
            message += " " + JSON.stringify(data);
        }
        debugLog(message);
        console.log("%c[FEIM]%c" + message, "color: #000; margin-right: 4px; background: #a0ecff; padding: 2px 6px; border: 1px solid #888", getStyle(level));
    }
};
var warn = function (message, level) {
    if (level === void 0) { level = LogLevel.WARN; }
    if (logLevel >= level) {
        debugLog(message);
        console.warn("[FEIM] " + message);
    }
};
var error = function (message) {
    if (logLevel > LogLevel.NONE) {
        debugLog(message);
        console.error("[FEIM] " + message);
    }
};

/**
 * FEIM API Game -> Operator messages
 */
var GameEvent;
(function (GameEvent) {
    /* Internal events */
    GameEvent["LISTENING"] = "game-listening";
    GameEvent["HELLO"] = "game-hello";
    GameEvent["CONFIGURE"] = "configure";
    GameEvent["REALITY_CHECK_RESOLVED"] = "rc-resolved";
    GameEvent["PAUSED"] = "idle-paused";
    GameEvent["RESUMING_AFTER_PAUSE"] = "pause-resumed";
    GameEvent["REPORT_SESSION_DETAILS"] = "rc-session-details";
    /* Initiated by the game */
    GameEvent["GAME_LOAD_STARTED"] = "game-load-started";
    GameEvent["GAME_LOAD_PROGRESS"] = "game-load-progress";
    GameEvent["GAME_LOAD_COMPLETED"] = "game-load-loaded";
    GameEvent["ROUND_STARTED"] = "game-round-started";
    GameEvent["ROUND_FINISHED"] = "game-round-finished";
    GameEvent["FEATURE_STARTED"] = "feature-started";
    GameEvent["FEATURE_FINISHED"] = "feature-finished";
    GameEvent["REQUEST_VIEWPORT_CONFIG"] = "game-request-viewport-config";
    GameEvent["BALANCE_UPDATE"] = "balance-update";
    GameEvent["BET_UPDATE"] = "bet-update";
    GameEvent["WIN_UPDATE"] = "win-update";
    GameEvent["UPDATE_SETTINGS"] = "settings-changed";
    GameEvent["ERROR_MESSAGE"] = "error-message";
    GameEvent["EXIT_GAME"] = "exit-game";
    GameEvent["AUTOPLAY_STARTED"] = "autoplay-started";
    GameEvent["AUTOPLAY_FINISHED"] = "autoplay-finished";
    GameEvent["GOTO_GAME"] = "goto-game";
    GameEvent["OPEN_QUICK_DEPOSIT"] = "open-quick-deposit";
    GameEvent["USER_ACTION"] = "user-action";
    GameEvent["REPORT_UI_STATE"] = "report-ui-state";
    GameEvent["JACKPOT_ANIMATION_STARTED"] = "jackpot-animation-started";
    GameEvent["JACKPOT_ANIMATION_FINISHED"] = "jackpot-animation-finished";
})(GameEvent || (GameEvent = {}));
/**
 * FEIM API Operator -> Game messages
 */
var OperatorEvent;
(function (OperatorEvent) {
    OperatorEvent["LISTENING"] = "listening";
    OperatorEvent["HELLO"] = "hello";
    OperatorEvent["REFRESH_BALANCE"] = "update-balance";
    OperatorEvent["UPDATE_SETTINGS"] = "settings-update";
    OperatorEvent["PAYTABLE_TOGGLE"] = "toggle-paytable";
    OperatorEvent["ERROR_MESSAGE_DISMISSED"] = "error-message-dismissed";
    OperatorEvent["VIEWPORT_UPDATE"] = "viewport-update";
    OperatorEvent["ERROR_MESSAGE_DISPLAYED"] = "error-message-displayed";
    OperatorEvent["EXITING_GAME"] = "exiting-game";
    OperatorEvent["LOCK_PLAY"] = "lock-play";
    OperatorEvent["UNLOCK_PLAY"] = "unlock-play";
    OperatorEvent["PAUSE_AUTOPLAY"] = "pause-autoplay";
    OperatorEvent["TOGGLE_GAME_HELP"] = "toggle-game-help";
    OperatorEvent["FREEZE"] = "freeze";
    OperatorEvent["UNFREEZE"] = "unfreeze";
    // For P2P only, when FEIM can't send rcchoice
    OperatorEvent["P2P_RC_CHOICE"] = "rc-choice";
    // Internal, will not reach the game. Once a round is not running will dispatch FREEZE instead, and open the RC popup if realityCheck is true
    OperatorEvent["_PAUSE_WHEN_IDLE"] = "pause-when-idle";
    OperatorEvent["_RESUME"] = "pause-resume";
    // Internal, will not reach game
    OperatorEvent["_SEND_RCCHOICE"] = "reality-check-choice";
    OperatorEvent["_NAVIGATE_GAME"] = "navigate-game";
    OperatorEvent["_INITIALIZED"] = "feim-initialized";
})(OperatorEvent || (OperatorEvent = {}));

/**
 * When rciframeurl parameter is present, this module handles the reality check iframe element creation and
 * relaying operator-bound messages to it.
 * rciframeurl is used with Rg API and Legacy RC API, but not with Theos
 */
var IFRAME_ID = "rg_rc_iframe";
// Legacy API methods relayed to the rc iframe
var OPERATOR_METHODS = ["gameLoaded", "gameLoadedHandler", "gamePausedHandler", "playTimeHandler",
    "handshakeSuccess", "handshakeCompleted", "handshakeFail", "handshakeFailed"];
var rcIframe = undefined;
var showExternalRealityCheck = function () {
    if (rcIframe) {
        rcIframe.style.display = "block";
    }
};
var closeExternalRealityCheck = function () {
    if (rcIframe) {
        rcIframe.style.display = "none";
    }
};
var initializeRcIframe = function () {
    var _a, _b;
    if (document.body === null) {
        window.addEventListener("load", initializeRcIframe);
        return;
    }
    window.removeEventListener("load", initializeRcIframe);
    var rcenable = getWindowParameter("rcenable");
    if (rcenable !== "true") {
        return;
    }
    var rcIframeUrl = getWindowParameter("rciframeurl");
    if (rcIframeUrl === undefined || rcIframeUrl === "" || rcIframeUrl.toLowerCase().includes("javascript:")) {
        return;
    }
    if (!rcIframeUrl.startsWith("https:") && !rcIframeUrl.startsWith("http:")) {
        return;
    }
    var element = document.getElementById(IFRAME_ID);
    if (!element) {
        log("Creating RC iframe", LogLevel.INIT);
        element = document.createElement("iframe");
        element.id = IFRAME_ID;
        element.style.display = "none";
        element.style.position = "fixed";
        element.style.left = "0";
        element.style.top = "0";
        element.style.width = "100%";
        element.style.height = "100%";
        element.style.zIndex = "1001";
        element.frameBorder = "0";
        element.setAttribute("sandbox", "allow-scripts allow-top-navigation-by-user-activation allow-same-origin allow-popups allow-popups-to-escape-sandbox");
        var wrapper = document.getElementById("rc_iframe_wrapper");
        if (wrapper) {
            wrapper.appendChild(element);
        }
        else {
            document.body.appendChild(element);
        }
    }
    var rcHistoryUrl = (_a = getWindowParameter("rchistoryurl")) !== null && _a !== void 0 ? _a : "";
    var homeurl = (_b = getWindowParameter("homeurl")) !== null && _b !== void 0 ? _b : "";
    var separator = rcIframeUrl.includes("?") ? "&" : "?";
    element.src = rcIframeUrl + separator + "rchistoryurl=" + rcHistoryUrl + "&homeurl=" + homeurl;
    rcIframe = element;
};
var isForOperator = function (data) {
    var _a;
    if (!data) {
        return false;
    }
    // Rg API message
    if ((_a = data.rgMessage) === null || _a === void 0 ? void 0 : _a.startsWith("gprg_")) {
        return true;
    }
    // Legacy RC API message
    if (data.method !== undefined && OPERATOR_METHODS.indexOf(data.method) >= 0) {
        return true;
    }
    return false;
};
/**
 * Relays the message to the rc iframe if present
 * @param data
 */
var relayPostMessageToRcIframe = function (message, targetOrigin) {
    if (rcIframe === undefined || !rcIframe.contentWindow) {
        return;
    }
    if (message === undefined) {
        return;
    }
    var messageData = message;
    if (!isForOperator(messageData)) {
        return;
    }
    rcIframe.contentWindow.postMessage(messageData, targetOrigin !== null && targetOrigin !== void 0 ? targetOrigin : "*");
};

var isInIframe = (function () {
    try {
        return window.self !== window.top;
    }
    catch (e) {
        return true;
    }
})();
/**
 * @internal
 * Posts a postMessage to parent and possibly rc iframe
 * @param message
 */
var postToOperator = function (message) {
    if (message === undefined) {
        return;
    }
    var targetOrigin = getTargetOrigin();
    relayPostMessageToRcIframe(message, targetOrigin);
    if (isInIframe) {
        window.parent.postMessage(message, targetOrigin);
    }
};

var outboundMessageBuffer = [];
var inboundMessageBuffer = [];
var MAX_BUFFER_SIZE = 32;
var pushToOutboundMessageBuffer = function (event, payload) {
    if (event === GameEvent.GAME_LOAD_PROGRESS || outboundMessageBuffer.length >= MAX_BUFFER_SIZE) {
        return;
    }
    outboundMessageBuffer.push({ type: event, payload: payload });
};
var pushToInboundMessageBuffer = function (event, handler) {
    inboundMessageBuffer.push({ event: event, handler: handler });
};
var flushOutboundMessageBuffer = function (api) {
    outboundMessageBuffer.forEach(function (pendingMessage) {
        log("Deferred send 🠊", LogLevel.ALL_MESSAGES, pendingMessage);
        postToOperator(api.processOutbound(pendingMessage.type, pendingMessage.payload));
    });
    outboundMessageBuffer.length = 0;
};
var processInboundMessageBuffer = function () {
    inboundMessageBuffer.forEach(function (element) {
        var event = element.event, handler = element.handler;
        handler(event);
    });
    inboundMessageBuffer.length = 0;
};

/**
 * Processes inbound and outbound messages (if they need adapting), and uses handshakes to pick the API
 */
var activeApi = undefined;
// Any apis waiting for hanshake - if one receives a valid answer, it is set as the active API and the others are removed
var waitingForHandshake = [];
/**
 * @internal
 * Attempt a handshake
 */
var addSupportedApi = function (api) {
    if (activeApi !== undefined) {
        // We already have an API that has gone through handshake
        return;
    }
    waitingForHandshake.push(api);
};
/**
 * @internal
 * Converts inbound messages to FEIM format
 */
var processInbound = function (message) {
    if (activeApi !== undefined) {
        return activeApi.processInbound(message);
    }
    waitingForHandshake.some(function (adapter) {
        if (adapter.checkHandshake(message)) {
            waitingForHandshake.length = 0;
            activeApi = adapter;
            log(activeApi.name + " set as active", LogLevel.INIT);
            if (isTargetOriginReceived()) {
                flushOutboundMessageBuffer(activeApi);
            }
            return true;
        }
        return false;
    });
    return undefined;
};
/**
 * @internal
 * Converts outbound messages to adapter format
 */
var processOutbound = function (event, payload) {
    if (activeApi !== undefined && isTargetOriginReceived()) {
        return activeApi.processOutbound(event, payload);
    }
    pushToOutboundMessageBuffer(event, payload);
    return undefined;
};

var registeredHandlers = new Map();
/**
 * @typeParam T Parameter type received by the callback function
 * @param type Event type/name to listen to
 */
var registerEventHandler = function (type) {
    if (!registeredHandlers.has(type)) {
        registeredHandlers.set(type, []);
    }
    /**
     *
     @param callback Callback funciton
     @param once Remove the listener after it's triggered once
     */
    return function (callback, once) {
        if (once === void 0) { once = false; }
        var _a;
        log("Registering handler for " + type, LogLevel.INIT);
        (_a = registeredHandlers.get(type)) === null || _a === void 0 ? void 0 : _a.push({
            callback: callback,
            once: once,
        });
    };
};
/**
 * Remove an event handler bound to a specific callback
 * @param type
 * @param callbackToRemove
 */
var removeEventHandler = function (type, callbackToRemove) {
    var _a;
    var filteredHandlers = (_a = registeredHandlers.get(type)) === null || _a === void 0 ? void 0 : _a.filter(function (handler) {
        return handler.callback === callbackToRemove;
    });
    if (filteredHandlers !== undefined) {
        registeredHandlers.set(type, filteredHandlers);
    }
};
/**
 * Removes all handlers using a callback.
 * @param callbackToRemove - All existing handlers using this callback will be removed
 */
var removeHandler = function (callbackToRemove) {
    // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
    registeredHandlers.forEach(function (_data, key) {
        removeEventHandler(key, callbackToRemove);
    });
};
var handleInboundMessageEvent = function (event) {
    var _a;
    var operatorOrigin = getTargetOrigin();
    if (operatorOrigin !== "*" && event.origin !== operatorOrigin) {
        return;
    }
    var data = processInbound(event.data);
    if (data === undefined) {
        // The message was not for FEIM
        return;
    }
    log("\uD83E\uDC08 Received " + data.feimOpEvent, LogLevel.ALL_MESSAGES, data.payload);
    var filteredHandlers = (_a = registeredHandlers.get(data.feimOpEvent)) === null || _a === void 0 ? void 0 : _a.filter(function (handler) {
        handler.callback(data.payload);
        // Remove once handlers
        return !handler.once;
    });
    if (filteredHandlers) {
        registeredHandlers.set(data.feimOpEvent, filteredHandlers);
    }
    else {
        warn("Warning! The game has no handlers for event " + data.feimOpEvent);
    }
};
/**
 * @internal
 * Directly trigger an event listened by the game
 */
var triggerEventInGame = function (event, payload) {
    var _a;
    (_a = registeredHandlers.get(event)) === null || _a === void 0 ? void 0 : _a.forEach(function (handlerData) {
        handlerData.callback(payload);
    });
};

var createMessageListener = function () {
    window.addEventListener("message", function (event) {
        if (!isTargetOriginReceived()) {
            pushToInboundMessageBuffer(event, handleInboundMessageEvent);
        }
        else {
            handleInboundMessageEvent(event);
        }
    });
};

var debug = {
    /**
     * Verify module configuration.
     *
     * Logs issues to console.
     *
     * @returns true if configuration is OK
     */
    verifyConfiguration: function () {
        var numIssues = 0;
        log("Checking module configuration ...", LogLevel.NONE);
        var logIssue = function (issue) {
            warn(issue);
            numIssues++;
        };
        if (_configuration.clientConfig === undefined) {
            logIssue("Configuration missing clientConfig");
        }
        else if (_configuration.clientConfig.gameServerApi === undefined) {
            logIssue("Invalid clientConfig format - not a valid /getclientconfig/ response");
        }
        if (_configuration.loginResponse === undefined) {
            logIssue("Configuration missing loginResponse");
        }
        else if (_configuration.loginResponse.sid === undefined) {
            logIssue("Invalid loginResponse format - not a valid login response");
        }
        if (numIssues === 0) {
            log("... Configuration OK", LogLevel.NONE);
            return true;
        }
        log("... Configuration is missing " + numIssues.toString() + " element(s)", LogLevel.NONE);
        return false;
    }
};

var outboundMessageListeners = [];
var sendGameEvent = function (type, payload) {
    outboundMessageListeners.forEach(function (handler) {
        handler({ type: type, payload: payload });
    });
    var message = processOutbound(type, payload);
    if (message === undefined) {
        return;
    }
    log("Sending 🠊", LogLevel.ALL_MESSAGES, message);
    postToOperator(message);
};
/**
 * Listen to the events sent by the game.
 * The callback will receive all the events.
 */
var registerOutBoundMessagesListener = function (listener) {
    outboundMessageListeners.push(listener);
};

var roundRunning = false;
var pausePending = false;
var pausePayload = undefined;
var startTimeMs = 0;
var initialRcElapsed = 0;
var checkPause = function () {
    if (!pausePending) {
        return;
    }
    if (roundRunning && !_configuration.allowMidRoundPause) {
        return;
    }
    pausePending = false;
    // autoPlayOnly pause events will not reach this module
    triggerEventInGame(OperatorEvent.FREEZE);
    sendGameEvent(GameEvent.PAUSED, pausePayload);
    pausePayload = undefined;
};
var triggerPause = function (payload) {
    pausePayload = payload;
    if (pausePending) {
        return;
    }
    pausePending = true;
    checkPause();
};
var triggerResume = function (payload) {
    log("Resume triggered with payload", LogLevel.ALL_MESSAGES, payload);
    pausePending = false;
    triggerEventInGame(OperatorEvent.UNFREEZE);
    sendGameEvent(GameEvent.RESUMING_AFTER_PAUSE, payload);
};
/**
 * In some situations reality check is triggered by an internal timer in FEIM, not the operator postMessages.
 * This will create that timer if the environment requires it.
 * This is only used by the Legacy RC.
 */
var handleClientSideRcInterval = function () {
    var _a;
    if (!hasWindowParameter("rcinterval")) {
        // rcinterval is not defined - RC must be triggered by the operator
        return;
    }
    if (!hasWindowParameter("rciframeurl")) {
        // rciframeurl is not defined - RC must be handled by the game
        return;
    }
    var rcinterval = Number(getWindowParameter("rcinterval"));
    if (isNaN(rcinterval) || rcinterval <= 0) {
        return;
    }
    if (startTimeMs !== 0) {
        // A timer already exists
        return;
    }
    startTimeMs = Date.now();
    initialRcElapsed = Number((_a = getWindowParameter("rcelapsed")) !== null && _a !== void 0 ? _a : 0);
    var nextRcTriggerSeconds = initialRcElapsed === 0
        ? rcinterval
        : rcinterval - initialRcElapsed % rcinterval;
    var ONE_SECOND = 1000;
    var triggerRealityCheckTime = function () {
        var totalElapsed = initialRcElapsed + Math.round((Date.now() - startTimeMs) / ONE_SECOND);
        sendGameEvent(GameEvent.REPORT_SESSION_DETAILS, { sessionTime: totalElapsed });
        triggerPause({ realityCheck: true });
        setTimeout(triggerRealityCheckTime, rcinterval * ONE_SECOND);
    };
    setTimeout(triggerRealityCheckTime, nextRcTriggerSeconds * ONE_SECOND);
};
/**
 * @internal
 * Internal handler for reality check or other pause messages.
 * The game will be frozen once a round is no longer in progress, and a paused event is dispatched.
 */
var handleIdlePause = function () {
    registerOutBoundMessagesListener(function (event) {
        if (event.type === GameEvent.ROUND_STARTED) {
            roundRunning = true;
        }
        else if (event.type === GameEvent.ROUND_FINISHED) {
            roundRunning = false;
            checkPause();
        }
    });
    registerEventHandler(OperatorEvent._PAUSE_WHEN_IDLE)(triggerPause);
    registerEventHandler(OperatorEvent._RESUME)(triggerResume);
};

/**
 * @internal
 * Internal handler for navigate game event
 */
var handleNavigateGame = function () {
    registerEventHandler(OperatorEvent._NAVIGATE_GAME)(function (data) {
        if (data.url !== undefined && (data.url.toLowerCase().startsWith("http:") || data.url.toLowerCase().startsWith("https:"))) {
            window.location.href = data.url;
        }
    });
};

var callbacks = {};
// Directly post a legacy RC message
var post = function (method, params) {
    postToOperator({ method: method, params: params });
};
var LegacyApiAdapter = /** @class */ (function () {
    function LegacyApiAdapter() {
        this.name = "Legacy RC";
        post("gameLoadedHandler");
    }
    LegacyApiAdapter.prototype.checkHandshake = function (message) {
        var data = message;
        if (data.method === "operatorLoaded") {
            // In case the operator loads itself after the game (if it lives inside the rciframe for example)
            post("gameLoadedHandler");
        }
        else if (data.method === "confirmHandshake") {
            log("Using direct Legacy PostMessage API connection", LogLevel.INIT);
            handleClientSideRcInterval();
            if (data.params.success !== undefined) {
                post(data.params.success);
            }
            triggerEventInGame(OperatorEvent._INITIALIZED);
            return true;
        }
        return false;
    };
    LegacyApiAdapter.prototype.processInbound = function (data) {
        var _a, _b;
        if (data === undefined) {
            return;
        }
        var eventData = data;
        if (eventData.method === undefined) {
            return;
        }
        // Events that need to reach the game are converted to FEIM format so all the listeners work
        switch (eventData.method) {
            case "pauseGame":
                callbacks.gamePausedCallback = (_a = eventData.params) === null || _a === void 0 ? void 0 : _a.callback;
                return { feimOpEvent: OperatorEvent._PAUSE_WHEN_IDLE, payload: { realityCheck: true } };
            case "resumeGame":
                callbacks.gameResumedCallback = (_b = eventData.params) === null || _b === void 0 ? void 0 : _b.callback;
                return { feimOpEvent: OperatorEvent._RESUME };
            case "navigateTo": {
                var payload = eventData.params;
                return { feimOpEvent: OperatorEvent._NAVIGATE_GAME, payload: payload };
            }
        }
        return undefined;
    };
    LegacyApiAdapter.prototype.processOutbound = function (event, _payload) {
        switch (event) {
            // Internal events
            case GameEvent.PAUSED: {
                showExternalRealityCheck();
                if (callbacks.gamePausedCallback !== undefined) {
                    return { method: callbacks.gamePausedCallback };
                }
                return;
            }
            case GameEvent.RESUMING_AFTER_PAUSE: {
                closeExternalRealityCheck();
                if (callbacks.gameResumedCallback !== undefined) {
                    return { method: callbacks.gameResumedCallback };
                }
                return;
            }
            case GameEvent.REPORT_SESSION_DETAILS: {
                var payload = _payload;
                return { method: "playTimeHandler", params: { delay: payload.sessionTime } };
            }
            // Legacy API will not get any new features (events), so it's fine to return NOT_APPLICABLE as default
            default: return;
        }
    };
    return LegacyApiAdapter;
}());

var version = "1.14.0";

/**
 * An adapter for a direct connection with Rg PostMessage API, removing the need for a Theos layer for it.
 */
var cachedBalance = 0;
// Directly post an rgMessage
var post$1 = function (type, payload) {
    postToOperator({ rgMessage: type, payload: payload });
};
var getErrors = function () {
    return [];
};
var RgPostMessageApiAdapter = /** @class */ (function () {
    function RgPostMessageApiAdapter() {
        this.name = "Rg PostMessage API";
        post$1("gprg_Listening");
    }
    RgPostMessageApiAdapter.prototype.checkHandshake = function (message) {
        var data = message;
        if (data.rgMessage === "oprg_Ready") {
            log("Using direct Rg PostMessage API connection", LogLevel.INIT);
            // Not sure if rcinterval is ever used in tandem with Rg API, but handle it just in case
            handleClientSideRcInterval();
            post$1("gprg_Ready");
            triggerEventInGame(OperatorEvent._INITIALIZED);
            return true;
        }
        return false;
    };
    RgPostMessageApiAdapter.prototype.processInbound = function (data) {
        if (data === undefined) {
            return;
        }
        var rgData = data;
        if (rgData.rgMessage === undefined || !rgData.rgMessage.includes("oprg_")) {
            return;
        }
        // Events that need to reach the game are converted to FEIM format so all the listeners work
        switch (rgData.rgMessage) {
            case "oprg_GamePause":
                if (rgData.payload !== undefined) {
                    var payload = rgData.payload;
                    if (payload.autoPlayOnly === true) {
                        return { feimOpEvent: OperatorEvent.PAUSE_AUTOPLAY };
                    }
                    return { feimOpEvent: OperatorEvent._PAUSE_WHEN_IDLE, payload: payload };
                }
                return { feimOpEvent: OperatorEvent._PAUSE_WHEN_IDLE };
            case "oprg_GameResume": {
                var payload = rgData.payload;
                return { feimOpEvent: OperatorEvent._RESUME, payload: payload };
            }
            case "oprg_NavigateGame": {
                var payload = rgData.payload;
                return { feimOpEvent: OperatorEvent._NAVIGATE_GAME, payload: payload };
            }
            case "oprg_DebugSettings":
                post$1("gprg_DebugSettings", { id: "Using FEIM v" + version });
                break;
            case "oprg_DebugErrors":
                post$1("gprg_DebugErrors", getErrors());
                break;
            case "oprg_Ping": {
                var payload = rgData.payload;
                if ((payload === null || payload === void 0 ? void 0 : payload.id) !== undefined) {
                    post$1("gprg_Pong", { id: payload.id });
                }
                else {
                    post$1("gprg_Pong");
                }
                break;
            }
            case "oprg_UpdateBalance":
                return { feimOpEvent: OperatorEvent.REFRESH_BALANCE };
            case "oprg_SetSounds": {
                var payload = rgData.payload;
                return { feimOpEvent: OperatorEvent.UPDATE_SETTINGS, payload: { sounds: payload.enableSounds } };
            }
            case "oprg_GetSoundState":
                break;
            default:
                warn("Unhandled rgMessage " + rgData.rgMessage);
        }
        return undefined;
    };
    /**
     * Converts game events to Rg Post Message API
     * Returns undefined if the message has no equivalent in Rg API and should not be sent.
     * Some unsent messages can still have side effects, as some data from them can be cached.
     * @param event
     * @param eventPayload
     */
    RgPostMessageApiAdapter.prototype.processOutbound = function (event, eventPayload) {
        // Some FEIM events have no equivalents in Rg API.
        // We have no default handler, this makes sure all new events are explicitly handled here - even if they do nothing.
        switch (event) {
            // Internal events
            case GameEvent.LISTENING: return; // Rg API handshake is done when it's first enabled
            case GameEvent.HELLO: return;
            case GameEvent.CONFIGURE: return;
            case GameEvent.REALITY_CHECK_RESOLVED: return;
            case GameEvent.PAUSED: {
                var payload = eventPayload;
                if (payload === null || payload === void 0 ? void 0 : payload.realityCheck) {
                    showExternalRealityCheck();
                }
                return { rgMessage: "gprg_GamePaused", payload: payload };
            }
            case GameEvent.RESUMING_AFTER_PAUSE: {
                var payload = eventPayload;
                if (payload === null || payload === void 0 ? void 0 : payload.realityCheck) {
                    closeExternalRealityCheck();
                }
                return { rgMessage: "gprg_GameResumed", payload: payload };
            }
            // Events from the game
            case GameEvent.GAME_LOAD_STARTED: return;
            case GameEvent.GAME_LOAD_PROGRESS: return;
            case GameEvent.GAME_LOAD_COMPLETED: return { rgMessage: "gprg_GameReady" };
            case GameEvent.ROUND_STARTED: {
                var sourcePayload = eventPayload;
                var payload = undefined;
                if ((sourcePayload === null || sourcePayload === void 0 ? void 0 : sourcePayload.balance) !== undefined) {
                    payload = { balance: sourcePayload.balance };
                }
                else if (cachedBalance >= 0) {
                    payload = { balance: cachedBalance };
                }
                return { rgMessage: "gprg_GameRoundStart", payload: payload };
            }
            case GameEvent.ROUND_FINISHED: {
                var sourcePayload = eventPayload;
                var payload = undefined;
                if ((sourcePayload === null || sourcePayload === void 0 ? void 0 : sourcePayload.balance) !== undefined) {
                    payload = { balance: sourcePayload.balance };
                }
                else if (cachedBalance >= 0) {
                    payload = { balance: cachedBalance };
                }
                return { rgMessage: "gprg_GameRoundEnd", payload: payload };
            }
            case GameEvent.FEATURE_STARTED: return;
            case GameEvent.FEATURE_FINISHED: return;
            case GameEvent.AUTOPLAY_STARTED: return;
            case GameEvent.AUTOPLAY_FINISHED: return;
            case GameEvent.REQUEST_VIEWPORT_CONFIG: return;
            case GameEvent.BALANCE_UPDATE:
                cachedBalance = eventPayload;
                return;
            case GameEvent.BET_UPDATE: return;
            case GameEvent.WIN_UPDATE: return;
            case GameEvent.UPDATE_SETTINGS: {
                var payload = { enableSounds: eventPayload.sounds };
                return { rgMessage: "gprg_Settings", payload: payload };
            }
            case GameEvent.ERROR_MESSAGE: return;
            case GameEvent.EXIT_GAME: return;
            case GameEvent.GOTO_GAME: return;
            case GameEvent.OPEN_QUICK_DEPOSIT: return { rgMessage: "gprg_OpenQuickDeposit" };
            case GameEvent.REPORT_SESSION_DETAILS: return { rgMessage: "gprg_RealityCheckData", payload: eventPayload };
            case GameEvent.USER_ACTION: return { rgMessage: "gprg_UserAction", payload: eventPayload };
            case GameEvent.REPORT_UI_STATE: return;
            case GameEvent.JACKPOT_ANIMATION_STARTED: return;
            case GameEvent.JACKPOT_ANIMATION_FINISHED: return;
        }
    };
    return RgPostMessageApiAdapter;
}());

/**
 * HTTP Post request
 *
 * @param url
 * @param parameters
 */
function httpPostRequest(url, parameters) {
    return __awaiter(this, void 0, void 0, function () {
        var init, response, error_1, STATUS_OK;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    init = {
                        method: "POST",
                        headers: {
                            "Accept": "application/json",
                            "Content-Type": "application/json",
                        },
                    };
                    if (parameters) {
                        init.body = JSON.stringify(parameters);
                    }
                    response = undefined;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, fetch(url, init)];
                case 2:
                    response = _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    console.error(error_1);
                    return [2 /*return*/];
                case 4:
                    STATUS_OK = 200;
                    if (response.status !== STATUS_OK) {
                        throw new Error(response.status.toString() + ": Fetch failed (" + url + ")");
                    }
                    return [4 /*yield*/, response.json()];
                case 5: return [2 /*return*/, _a.sent()];
            }
        });
    });
}

var handlerExists = false;
/**
 * @internal
 * Internal handler for a reality check using /rcchoice/, so that the game doesn't need to use
 * this undocumented request.
 */
var handleRcChoice = function (config) {
    if (handlerExists) {
        return;
    }
    registerEventHandler(OperatorEvent._SEND_RCCHOICE)(function (data) {
        var _a;
        if (config.clientConfig === undefined || ((_a = config.loginResponse) === null || _a === void 0 ? void 0 : _a.sid) === undefined) {
            triggerEventInGame(OperatorEvent.P2P_RC_CHOICE, data);
            if (data.action === "continue") {
                sendGameEvent(GameEvent.REALITY_CHECK_RESOLVED);
            }
            return;
        }
        httpPostRequest(config.clientConfig.gameServerApi + "/rcchoice", {
            sid: config.loginResponse.sid,
            choice: data.action,
        }).then(function () {
            if (data.action === "continue") {
                // status received. Can be an error, but unfreeze the game anyway - the player can try again
                sendGameEvent(GameEvent.REALITY_CHECK_RESOLVED);
            }
        }).catch(function (_reason) {
            error("Failed to send rcchoice");
        });
    });
    handlerExists = true;
};

/**
 * Theos API. Handshake and handling any configuration Theos layer sends.
 * FEIM uses Theos API event names and payloads internally so messages pass through unchanged.
 */
var TheosApi = /** @class */ (function () {
    function TheosApi() {
        this.name = "Theos API";
        log("Starting Theos handshake ...", LogLevel.INIT);
        postToOperator(this.processOutbound(GameEvent.LISTENING));
    }
    TheosApi.prototype.checkHandshake = function (data) {
        var message = data;
        if (message.feimOpEvent === OperatorEvent.LISTENING) {
            log("... saying hello ...", LogLevel.INIT);
            var helloData = { feimVersion: version };
            postToOperator(this.processOutbound(GameEvent.HELLO, helloData));
            // Handle the /rcchoice/ reality check used by some operators
            handleRcChoice(_configuration);
        }
        else if (message.feimOpEvent === OperatorEvent.HELLO) {
            var payload = message.payload;
            log("... THEOS handshake complete", LogLevel.INIT);
            if (payload.handlesErrors) {
                log("Error messages are handled by the operator", LogLevel.INIT);
                _configuration.operatorHandlesErrors = true;
            }
            if (payload.handlesExit) {
                log("Game exiting is handled by the operator", LogLevel.INIT);
                _configuration.operatorHandlesGameExit = true;
            }
            triggerEventInGame(OperatorEvent._INITIALIZED);
            return true;
        }
        return false;
    };
    TheosApi.prototype.processInbound = function (data) {
        if (data.feimOpEvent !== undefined) {
            return data;
        }
        return undefined;
    };
    TheosApi.prototype.processOutbound = function (event, payload) {
        var processed = { feimGameEvent: event };
        if (payload !== undefined) {
            processed.payload = payload;
        }
        return processed;
    };
    return TheosApi;
}());

var apexApiCreated = false;
var rgApisCreated = false;
/**
 * @internal
 * Sends some configuration data to the possible Theos layer
 */
var configureApi = function (newConfig) {
    log("Assigning config:", LogLevel.INIT, Object.keys(newConfig));
    log("Config content:", LogLevel.ALL_MESSAGES_AND_PAYLOADS, newConfig);
    var config = getConfiguration();
    Object.assign(config, newConfig);
    if (!rgApisCreated && config.handleRgPostMessageAPI === true && isTargetOriginReceived()) {
        rgApisCreated = true;
        addSupportedApi(new RgPostMessageApiAdapter());
        addSupportedApi(new LegacyApiAdapter());
    }
    // APEX handshake is attempted once we get either clientConfig or p2pConfig, as they can contain targetOrigin
    if (!apexApiCreated && isTargetOriginReceived()) {
        apexApiCreated = true;
        addSupportedApi(new TheosApi());
        processInboundMessageBuffer();
    }
    var loginResponse = newConfig.loginResponse;
    try {
        if (loginResponse !== undefined) {
            var configureData = { currencyCode: loginResponse.stats.currency, specialSessionConfig: loginResponse.specialSessionConfig };
            sendGameEvent(GameEvent.CONFIGURE, configureData);
        }
    }
    catch (e) {
        error("Invalid login response");
    }
    if (newConfig.p2pConfig !== undefined) {
        var configureData = { currencyCode: newConfig.p2pConfig.currency, specialSessionConfig: newConfig.p2pConfig.specialSessionConfig };
        sendGameEvent(GameEvent.CONFIGURE, configureData);
    }
    if (newConfig.handleFeaturePause) {
        sendGameEvent(GameEvent.CONFIGURE, { handleFeaturePause: newConfig.handleFeaturePause });
    }
};
/**
 * Configures the module.
 *
 * Can be called multiple times, new configuration is merged into the existing one.
 *
 * @param config - An object containing the configuration changes
 */
var configure = function (config) {
    setLogLevel(config.logLevel);
    configureApi(config);
};

var openNewTab = function (url) {
    if (url === undefined || url === "") {
        return false;
    }
    window.open(url, "_blank");
    return true;
};

/**
 * Will send an action postMessage if the given target matches the pattern.
 *
 * @returns false if an action was not sent (not a valid action).
 *
 * @param target Target string, such as &homeurl value
 */
var postAction = function (target) {
    if (target === undefined || target === "") {
        return false;
    }
    var ACTION_PREFIX = "action:";
    if (!target.startsWith(ACTION_PREFIX)) {
        return false;
    }
    // URL is an action - send an action postMessage
    var action = target.slice(ACTION_PREFIX.length);
    sendGameEvent(GameEvent.USER_ACTION, { action: action });
    return true;
};
/**
 * Report that the game has started loading.
 */
var gameLoadStarted = function () {
    sendGameEvent(GameEvent.GAME_LOAD_STARTED);
};
/**
 * Send game load progress.
 * @param progress - Game loading progress, between 0 and 100
 */
var gameLoadProgress = function (progress) {
    sendGameEvent(GameEvent.GAME_LOAD_PROGRESS, progress);
};
/**
* Report that the game has finished loading.
*/
var gameLoadCompleted = function () {
    sendGameEvent(GameEvent.GAME_LOAD_COMPLETED);
};
/**
 * Report that a game round has started animating.
 * @param roundStartedData - Data containing the balance after the spin (but before any winnings), and round information when a round starts.
 */
var roundStarted = function (roundStartedData) {
    sendGameEvent(GameEvent.ROUND_STARTED, roundStartedData);
};
/**
 * Reports that the game round animations have completed, and final balance is shown.
 * @param roundFinishedData Game status after round end.
 */
var roundFinished = function (roundFinishedData) {
    var dataToSend = roundFinishedData;
    if ((roundFinishedData === null || roundFinishedData === void 0 ? void 0 : roundFinishedData.playResponse) !== undefined) {
        // Only a part of the playResponse will be sent. 'roundType' is the only one required (must also be given by P2P).
        var _a = roundFinishedData.playResponse, roundType = _a.roundType, stats = _a.stats, roundId = _a.roundId;
        dataToSend = __assign(__assign({}, roundFinishedData), { playResponse: {
                roundType: roundType,
                stats: stats,
                roundId: roundId
            } });
    }
    sendGameEvent(GameEvent.ROUND_FINISHED, dataToSend);
};
/**
 * Report that a feature (bonus game) is a starting.
 * In some jurisdictions the game will be paused with [[freeze]] as a response, and continued once the player has confirmed it.
 * (see [[handleFeaturePause]])
 * @param featureData Feature details, such as type. Optional, can be used to fine tune the response to this event.
 */
var featureStarted = function (featureData) {
    sendGameEvent(GameEvent.FEATURE_STARTED, featureData);
};
/**
 * Report that a feature (bonus game) has finished.
 * @param featureData Feature details, such as type. Optional, can be used to fine tune the response to this event.
 */
var featureFinished = function (featureData) {
    sendGameEvent(GameEvent.FEATURE_FINISHED, featureData);
};
/**
 * Report that an autoplay session has started.
 */
var autoPlayStarted = function () {
    sendGameEvent(GameEvent.AUTOPLAY_STARTED);
};
/**
 * Report that an autoplay session has ended.
 */
var autoPlayFinished = function () {
    sendGameEvent(GameEvent.AUTOPLAY_FINISHED);
};
/**
 * Sends a balance update to operator window.
 *
 * send.[[roundStarted]] and send.[[roundFinished]] will automatically send this if their balance fields are valid (not negative).
 *
 * on.[[refreshBalance]] needs to be answered with this.
 *
 * @param balance - New balance, in cents
 */
var balanceUpdate = function (balance) {
    sendGameEvent(GameEvent.BALANCE_UPDATE, balance);
};
/**
 * Report a stake/bet amount change.
 * @param bet - The new bet amount, in cents
 */
var betUpdate = function (bet) {
    sendGameEvent(GameEvent.BET_UPDATE, bet);
};
/**
 * Report a win.
 *
 * `send.roundFinished` will send this automatically if it has a valid winnings field.
 *
 * A win update must be sent for every played round, even if the win is 0.
 *
 * @param win - Win amount data
 */
var winUpdate = function (win) {
    sendGameEvent(GameEvent.WIN_UPDATE, win);
};
/**
 * Report a setting change.
 *
 * @param settings - An object containing one ore more changed settings
 */
var updateSettings = function (settings) {
    sendGameEvent(GameEvent.UPDATE_SETTINGS, settings);
};
/**
 * Send an error message for the operator to show.
 *
 * If you do not want to use [[showError]], you can use this to send the error message directly.
 *
 * Use on.[[errorMessageDismissed]] to detect when the popup is closed in the operator window.
 *
 * Use on.[[errorMessageDisplayed]] if you need to know if a popup was displayed in the operator window.
 *
 * [[operatorHandlesErrors]] in [[getConfiguration]] return data is true if the environment is using remote error messages.
 *
 * @param message - The error message, in the format it is received from the Casino server
 *
 * @returns False if the operator is not handling error popups, and they should be shown in game ([[getConfiguration]] returns [[operatorHandlesErrors]] as false).
 */
var errorMessage = function (message) {
    sendGameEvent(GameEvent.ERROR_MESSAGE, message);
    if (!_configuration.operatorHandlesErrors) {
        return false;
    }
    return true;
};
/**
 * Navigates the game window to a new page.
 *
 * Also handles the `action:` prefix.
 *
 * Note: [[exitGame]] will navigate to `&homeurl` automatically, so it's possible you never need to use this function directly.
 *
 * @param target Navigate target - url or user action
 * @returns true if the parameter was defined and not empty
 */
var navigate = function (target) {
    if (target === undefined || target === "") {
        return false;
    }
    if (postAction(target)) {
        return true;
    }
    window.location.href = target;
    return true;
};
/**
 * Request game exit. Covers all game exit situations: will notify the operator, redirect the game window to `&homeurl`, or move back in browser history if neither
 * is applicable. Also handles the 'buttonEventsIframe' setting of client config.
 *
 * Called for example when the home button is clicked on mobile, or when the game is closed via reality check.
 *
 * @returns True if succesful. False if there's a configuration error, and closing the game is not possible.
 */
var exitGame = function () {
    var _a;
    sendGameEvent(GameEvent.EXIT_GAME);
    if (!_configuration.operatorHandlesGameExit) {
        var homeurl = getWindowParameter("homeurl");
        if (navigate(homeurl)) {
            return true;
        }
        if ((_a = _configuration.clientConfig) === null || _a === void 0 ? void 0 : _a.buttonEventsIframe) {
            postToOperator("closeGame");
            return true;
        }
        if (homeurl === undefined || homeurl === "") {
            if (window.history.length > 1) {
                window.history.back();
                return true;
            }
            return false;
        }
    }
    return true;
};
/**
 * Show history. Will notify the operator or open a new tab to RC history URL.
 *
 * Must be called directly from a user interaction handler (e.g. a click event), otherwise the popup might get blocked.
 */
var showHistory = function () {
    var _a;
    var rcHistoryUrl = getWindowParameter("rchistoryurl");
    if (postAction(rcHistoryUrl)) {
        return;
    }
    if (openNewTab(rcHistoryUrl)) {
        return;
    }
    if ((_a = _configuration.clientConfig) === null || _a === void 0 ? void 0 : _a.buttonEventsIframe) {
        postToOperator("showHistory");
    }
};
/**
 * @hidden
 * Go to a game, if the operator supports it. This game will be closed if successful.
 *
 * Using this is optional.
 */
var goToGame = function (gameRef) {
    sendGameEvent(GameEvent.GOTO_GAME, gameRef);
    // TODO: check operator support
    return true;
};
/**
 * Open a quick deposit, if the operator supports it.
 *
 * Using this is optional. Can be sent for example when the in-game out of funds error message is closed.
 *
 * The operator is expected to dispatch [[refreshBalance]] if a deposit is made.
 *
 * If the operator does not support this, nothing will happen.
 */
var openQuickDeposit = function () {
    sendGameEvent(GameEvent.OPEN_QUICK_DEPOSIT);
};
/**
 * Report a change in user interface.
 *
 * e.g. `send.reportUIState({splashScreenVisible: true})`
 *
 * Using this is optional.
 */
var reportUIState = function (state) {
    sendGameEvent(GameEvent.REPORT_UI_STATE, state);
};
/**
 * Report the ending of jackpot lottery animation.
 *
 * Jackpot panel stops updating itself if a game round triggers a jackpot. This event is needed for the jackpot panel to resume its updates mid-round after a jackpot is triggered. If not given, the jackpot panel will wait until the end of the round before resuming updates.
 */
var jackpotResolved = function () {
    sendGameEvent(GameEvent.JACKPOT_ANIMATION_FINISHED);
};

var send = /*#__PURE__*/Object.freeze({
    __proto__: null,
    gameLoadStarted: gameLoadStarted,
    gameLoadProgress: gameLoadProgress,
    gameLoadCompleted: gameLoadCompleted,
    roundStarted: roundStarted,
    roundFinished: roundFinished,
    featureStarted: featureStarted,
    featureFinished: featureFinished,
    autoPlayStarted: autoPlayStarted,
    autoPlayFinished: autoPlayFinished,
    balanceUpdate: balanceUpdate,
    betUpdate: betUpdate,
    winUpdate: winUpdate,
    updateSettings: updateSettings,
    errorMessage: errorMessage,
    navigate: navigate,
    exitGame: exitGame,
    showHistory: showHistory,
    goToGame: goToGame,
    openQuickDeposit: openQuickDeposit,
    reportUIState: reportUIState,
    jackpotResolved: jackpotResolved
});

/**
 * Triggered once the environment configuration is received from both the game and the operator.
 * Handshake is done and everything is set up.
 *
 * Can be useful if you need to do something with [[getConfiguration]] early on, as the values will be undefined before this.
 * Otherwise there's no need to listen to this.
 * @param callback
 */
var initialized = function (callback) {
    if (isHandshakeDone()) {
        callback();
    }
    else {
        registerEventHandler(OperatorEvent._INITIALIZED)(callback);
    }
};
/**
 * The operator requests a balance update.
 *
 * Request Casino World API `/getbalance/` and then use send.[[balanceUpdate]] to send back the refreshed balance.
 */
var refreshBalance = function (callback) {
    registerEventHandler(OperatorEvent.REFRESH_BALANCE)(callback);
};
/**
 * Settings have been changed in the operator front end, they need to be synchronized in game.
 *
 * The settings argument only contains the changed settings, unchanged settings are undefined:
 * ```
 * on.updateSettings((changedSettings) =>
 * {
 *   if (changedSettings.sounds !== undefined) {
 *     enableSounds(changedSettings.sounds)
 *   }
 *
 *   if (changedSettings.fastPlay !== undefined) {
 *     enableFastPlay(changedSettings.fastPlay)
 *   }
 * })
 * ```
 *
 * @param callback A function to update in-game settings to match
 */
var updateSettings$1 = function (callback) {
    // Not just returning this because tsdoc will not document the type
    registerEventHandler(OperatorEvent.UPDATE_SETTINGS)(callback);
};
/**
 * Paytable should be shown, hidden, or its visibility toggled (if applicable).
 *
 * If the action argument is undefined or doesn't specify the action type, toggle paytable visibility.
 *
 * If `action?.type` is for example `"show"` but the paytable is already visible, this event should do nothing.
 */
var togglePaytable = function (callback) {
    registerEventHandler(OperatorEvent.PAYTABLE_TOGGLE)(callback);
};
/**
 * If you do not want to use [[showError]], this can be used to detect when an error message
 * popup is dismissed in the operator window.
 */
var errorMessageDismissed = function (callback) {
    registerEventHandler(OperatorEvent.ERROR_MESSAGE_DISMISSED)(callback);
};
/**
 * An error message was displayed in the operator window.
 */
var errorMessageDisplayed = function (callback) {
    registerEventHandler(OperatorEvent.ERROR_MESSAGE_DISPLAYED)(callback);
};
/**
 * Game help should be shown, hidden, or its visibility toggled.
 *
 * If the action argument is undefined or doesn't specify the action type, toggle game help visibility.
 *
 * If `action?.type` is for example `"show"` but game help is already visible, this event should do nothing.
 */
var toggleGameHelp = function (callback) {
    registerEventHandler(OperatorEvent.TOGGLE_GAME_HELP)(callback);
};
/**
 * The game will be closed imminently.
 *
 * The operator will handle closing the game frame; this function can be used to for example send any last second messages.
 */
var exitingGame = function (callback) {
    registerEventHandler(OperatorEvent.EXITING_GAME)(callback);
};
/**
 * Pause autoplay, or stop it if pausing is not possible.
 */
var pauseAutoPlay = function (callback) {
    registerEventHandler(OperatorEvent.PAUSE_AUTOPLAY)(callback);
};
/**
 * @hidden
 * Disable play controls so that no further gameplay is possible until on.[[unlockPlay]] is received.
 *
 * Autoplay should be paused, if active.
 */
var lockPlay = function (callback) {
    registerEventHandler(OperatorEvent.LOCK_PLAY)(callback);
};
/**
 * @hidden
 * Enable play controls if they were disabled by on.[[lockPlay]]
 */
var unlockPlay = function (callback) {
    registerEventHandler(OperatorEvent.UNLOCK_PLAY)(callback);
};
/**
 * When received, pause the game, prevent further game play, and block user interaction. Unfreeze when on.[[unfreeze]] is received.
 *
 * If received during an active game round, the game animation should be paused immediately instead of waiting until the end of the round,
 * as sometimes the game must be paused mid-round before a feature/bonus game starts. Reality check related freezes are automatically delayed
 * until any ongoing game round has ended.
 *
 * Any ongoing autoplay must be paused.
 */
var freeze = function (callback) {
    registerEventHandler(OperatorEvent.FREEZE)(callback);
};
/**
 * When received, unfreeze the game if it's been frozen by on.[[freeze]]
 */
var unfreeze = function (callback) {
    registerEventHandler(OperatorEvent.UNFREEZE)(callback);
};

var on = /*#__PURE__*/Object.freeze({
    __proto__: null,
    initialized: initialized,
    refreshBalance: refreshBalance,
    updateSettings: updateSettings$1,
    togglePaytable: togglePaytable,
    errorMessageDismissed: errorMessageDismissed,
    errorMessageDisplayed: errorMessageDisplayed,
    toggleGameHelp: toggleGameHelp,
    exitingGame: exitingGame,
    pauseAutoPlay: pauseAutoPlay,
    lockPlay: lockPlay,
    unlockPlay: unlockPlay,
    freeze: freeze,
    unfreeze: unfreeze
});

/**
 * Needs to be handled only when not using the Relax game server. Otherwise FEIM handles this internally.
 *
 * When triggered, call the corresponding endpoint of the game server, which then forwards the choice to Relax P2P API.
 *
 * Note! If the player chose to continue, an unfreeze event will also be triggered at the same time with this. However,
 * the game should actually only continue once an answer for the aforementioned endpoint request is received.
 */
var onRealityCheckChoiceRequired = function (callback) {
    registerEventHandler(OperatorEvent.P2P_RC_CHOICE)(callback);
};

var P2P = /*#__PURE__*/Object.freeze({
    __proto__: null,
    onRealityCheckChoiceRequired: onRealityCheckChoiceRequired
});

/**
 * @packageDocumentation
 *
 * @example
 * ```
 * import { api } from "@rlx/feim"
 *
 * api.send.balanceUpdate(500)
 *
 * api.on.refreshBalance(() => {
 *  // Refresh it
 * })
 * ```
 */
/**
 * Remove all handlers using this callback
 * @param callbackToRemove - All existing handlers using this callback will be removed
 */
var remove = function (callbackToRemove) {
    removeHandler(callbackToRemove);
};

/**
 * An async alternative to send.errorMessage. Shows an error popup - using the remote error message system if used by the operator -
 * and resolves once the error popup is closed. Requires [[showErrorMessageCallback]] to be configured.
 *
 * Will trigger on.[[freeze]] when the error is shown, and on.[[unfreeze]] when the error is resolved.
 *
 * If the operator _is not_ handling error popups, the given [[showErrorMessageCallback]] is called. If [[showErrorMessageCallback]] returns a Promise and
 * it is resolved, the Promise returned by this function is resolved as well.
 * If [[showErrorMessageCallback]] does not return a Promise, the Promise returned by this function is resolved immediately.
 *
 * If the operator _is_ handling error popups, the module will send the error message data to the operator.
 * The promise returned by this function is resolved once that error message is dismissed in the operator's window.
 *
 * This is a convenience function, using send.errorMessage, on.errorMessageDisplayed and on.errorMessageDismissed internally.
 *
 * ```
 * await showError(casinoResponseContainingError)
 * console.log("Error message closed, continue game")
 * ```
 *
 * @param message - The casino response containing the error
 *
 * @returns A Promise which will be resolved when the operator popup is closed, or, if the operator isn't handling error popups, when the [[showErrorMessageCallback]] Promise is resolved.
 */
var showError = function (message) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        // If config has remoteErrorMessages, send the message, wait for dismissed and resolve
        return [2 /*return*/, new Promise(function (resolve, reject) {
                // No in-game error function defined: reject
                if (_configuration.showErrorMessageCallback === undefined) {
                    log("showErrorMessageCallback is not defined", LogLevel.WARN);
                    reject();
                    return;
                }
                if (_configuration.operatorHandlesErrors) {
                    log("Showing remote error message");
                    // Remote error messages enabled: send the message, wait for dismissed and resolve
                    sendGameEvent(GameEvent.ERROR_MESSAGE, message);
                    triggerEventInGame(OperatorEvent.FREEZE);
                    errorMessageDismissed(function () {
                        triggerEventInGame(OperatorEvent.UNFREEZE);
                        resolve();
                    });
                }
                else {
                    triggerEventInGame(OperatorEvent.FREEZE);
                    /**
                     * Remote error messages are disabled: call showErrorMessageCallback, wait for dismissed (if a Promise)
                     */
                    Promise.resolve(_configuration.showErrorMessageCallback(message)).then(function (result) {
                        triggerEventInGame(OperatorEvent.UNFREEZE);
                        resolve(result);
                    }).catch(function (reason) {
                        triggerEventInGame(OperatorEvent.UNFREEZE);
                        reject(reason);
                    });
                }
            })];
    });
}); };

window.rlxfeim = {
    verifyConfiguration: debug.verifyConfiguration,
    // Only populated if &rlxfeimdebug is present
    log: [],
};
createMessageListener();
// Pause will only trigger in-game once any unfinished round has ended
handleIdlePause();
// Redirect game window on navigate game event
handleNavigateGame();
// Creates the RC iframe if rciframeurl is present
initializeRcIframe();
//# sourceMappingURL=index.js.map
