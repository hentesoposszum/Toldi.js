const { readFileSync, readdirSync, statSync } = require("fs");
const { parse } = require("url");
const { join } = require("path");
const { EventEmitter } = require("events");

let debugMode = process.env.TOLDI_DEBUG ? true : false;

/**
 * @typedef {import("http").IncomingMessage} IncomingMessage
 * @typedef {import("http").ServerResponse} ServerResponse
 */

/**
 * Class for representing the handler of a specific method inside a Route
 */
class Handler {
	constructor(handler, ...middlewares) {
		this.handler = handler;
		this.middlewares = middlewares;
	}

	/**
	 * This function is responsible for processing a request and responding to it
	 * @param {IncomingMessage} req - the request object received from the client
	 * @param {ServerResponse} res - the response object that will be sent to the client
	 */
	handle(req, res) {
		this.handler(req, res);
	}
}

/**
 * Class for handling a splitter
 */
class SplitHandler {
	constructor(splitter, ...handlers) {
		this.splitter = splitter;
		this.handlers = handlers;
		this.middlewares = [];
	}

	/**
	 * This function is responsible for processing a request and responding to it
	 * @param {IncomingMessage} req - the request object received from the client
	 * @param {ServerResponse} res - the response object that will be sent to the client
	 */
	async handle(req, res) {
		const result = await this.splitter(req, res);

		if (result >= this.handlers.length || result < 0) {
			emitter.emit("error", new Error(`The result of a splitter function pointed to a handler that doesn't exist. (${result})`));
			res.writeHead(500, {"Content-Type": "text/html"});
			res.end(responses["500"]);
			return;
		}
		
		this.handlers[result](req, res);
	}
}

/**
 * Class for representing a route and its handlers
 */
class Route {
	/**
	 * @constructor
	 * @param {String} path - path of the route object 
	 */
	constructor(path) {
		this.path = path;
		
		/**
		 * An object containing the handlers, where the request handler of a certain method can be accessed by using the method as the key
		 * @type {Object.<String, (Handler | SplitHandler)>}
		 */
		this.handlers = {};
		
		/**
		 * An array of middleware functions that should be called before every request, regardless of its method
		 * @type {function[]}
		 */
		this.middlewares = [];
	}

	/**
	 * Adds a handler to the route object
	 * @param {String} method - the method for which this handler is responsible
	 * @param {function} requestHandler - the function responsible for processing the request and sending a response
	 * @param  {...function} middlewares - function(s) that should be called before the requestHandler
	 * @returns {Route} this route
	 */
	addHandler(method, requestHandler, ...middlewares) {
		this.handlers[method.toUpperCase()] = new Handler(requestHandler, ...middlewares);
		return this;
	}
	
	/** Shorthand for addHandler("GET", ...) */
	get(requestHandler, ...middlewares) {
		return this.addHandler("GET", requestHandler, ...middlewares);
	}

	/** Shorthand for addHandler("POST", ...) */
	post(requestHandler, ...middlewares) {
		return this.addHandler("POST", requestHandler, ...middlewares);
	}
	
	/** Shorthand for addHandler("PUT", ...) */
	put(requestHandler, ...middlewares) {
		return this.addHandler("PUT", requestHandler, ...middlewares);
	}
	
	/** Shorthand for addHandler("PATCH", ...) */
	patch(requestHandler, ...middlewares) {
		return this.addHandler("PATCH", requestHandler, ...middlewares);
	}

	/** Shorthand for addHandler("DELETE", ...) */
	delete(requestHandler, ...middlewares) {
		return this.addHandler("DELETE", requestHandler, ...middlewares);
	}

	/** Adds a handler to the route object, which will handle every request. Shorthand for addHandler("ALL", ...) */
	all(requestHandler, ...middlewares) {
		return this.addHandler("ALL", requestHandler, ...middlewares);
	}

	/**
	 * Adds middleware function (or multiple middleware functions) to every method
	 * @param  {...function} middlewares - middleware function(s) that should be added to the route
	 * @returns {Route} this route
	 */
	addMiddleware(...middlewares) {
		this.middlewares.push(...middlewares);
		return this;
	}
	
	/**
	 * Adds middleware function (or multiple middleware functions) to a specified method
	 * @param {(String | String[])} method - name of the method which the middleware should be added to or an array of method names
	 * @param  {...function} middlewares - middleware function(s) that should be added to the method(s)
	 * @returns {Route} this route
	 */
	addMiddlewareToMethod(method, ...middlewares) {
		if (method.constructor.name === "Array") {
			for (let i = 0; i < method.length; i++)
				this.handlers[method[i]].middlewares.push(...middlewares);
		} else {
			this.handlers[method].middlewares.push(...middlewares);
		}

		return this;
	}

	/**
	 * Adds a split handler to a method
	 * @param {String} method - name of the method which the split handler should be added to or an array of method names
	 * @param {function} splitter - the splitter function which decides which requestHandler is called for a specific request
	 * @param  {...function} requestHandlers - a list of functions which handle the processing of a request in certain scenarios (decided by the splitter function)
	 * @returns {Route} this route
	 */
	addSplitHandler(method, splitter, ...requestHandlers) {
		if (method instanceof Array) {
			for (let i = 0; i < method.length; i++) {
				this.handlers[method[i]] = new SplitHandler(splitter, ...requestHandlers);
			}
		} else {
			this.handlers[method] = new SplitHandler(splitter, ...requestHandlers);
		}
		
		return this;
	}

	/** Shorthand for addSplitHandler("GET", ...) */
	getSplitHandler(splitter, ...requestHandlers) {
		return this.addSplitHandler("GET", splitter, ...requestHandlers);
	}
	
	/** Shorthand for addSplitHandler("POST", ...) */
	postSplitHandler(splitter, ...requestHandlers) {
		return this.addSplitHandler("POST", splitter, ...requestHandlers);
	}

	/** Shorthand for addSplitHandler("PUT", ...) */
	putSplitHandler(splitter, ...requestHandlers) {
		return this.addSplitHandler("PUT", splitter, ...requestHandlers);
	}
	
	/** Shorthand for addSplitHandler("PATCH", ...) */
	patchSplitHandler(splitter, ...requestHandlers) {
		return this.addSplitHandler("PATCH", splitter, ...requestHandlers);
	}

	/** Shorthand for addSplitHandler("DELETE", ...) */
	deleteSplitHandler(splitter, ...requestHandlers) {
		return this.addSplitHandler("DELETE", splitter, ...requestHandlers);
	}
}

/**
 * Stores response messages for responses automatically sent back with error
 * @type {Object.<String, String>}
 */
const responses = {
	"400b": "400 Bad Request: Malformed request body syntax",
	"400q": "400 Bad Request: Malformed query syntax",
	"400c": "400 Bad Request: Malformed cookie syntax",
	"404": "404: Page Not Found",
	"415": "415 Unsupported Media Type: Unsupported Content-Type",
	"500": "500 Internal Server Error: Please try again in a few minutes, and contact the administrator of the site with your issue if it doesn't go away soon"
};

/**
 * EventEmitter used for triggering events, mostly during the request processing pipeline
 * @type {EventEmitter}
 */
const emitter = new EventEmitter();

/**
 * Indicates what search mode the router uses for finding the correct handler function for a request
 * @type {"dynamic" | "static"}
 */
exports.searchMode = "dynamic";

/**
 * An array for storing every route the server should handle
 * @type {Route[]}
 */
exports.routes = [];

/**
 * @description An array of functions that are called before every request (to process the request object)
 * @type {function[]}
 */
exports.middlewares = [];

/**
 * Enables common middlewares (SETUP)
 * @param {Boolean} [useBodyParser=true] - use the body parsing middleware
 * @param {Boolean} [useCookieParser=true] - use the cookie parsing middleware
 * @param {Boolean} [useQueryParser=true] - use the query parsing middleware
 * @param {Boolean} [addRedirectToResponse=true] - add a redirect function to a response
 */
exports.setupMiddlewares = (useBodyParser, useCookieParser, useQueryParser, addRedirectToResponse) => {
	const requestParsers = require("./middlewares/requestParsers");
	requestParsers.init(responses);

	if (addRedirectToResponse !== false)
		this.addMiddleware(require("./middlewares/redirectToResponse"));
	if (useBodyParser !== false)
		this.addMiddleware(requestParsers.bodyParser);
	if (useCookieParser !== false)
		this.addMiddleware(requestParsers.cookieParser);
	if (useQueryParser !== false)
		this.addMiddleware(requestParsers.queryParser);
};

/**
 * Finds a route by its path or (optionally) creates a new one if it doesn't exist
 * @param {String} path - path of the route
 * @param {Boolean} [createNew=true] - enables creating a new Route object if the search didn't yield any results
 * @returns {?Route} The route with the specified path, or null if the search was unsuccessful and the createNew argument was set to false
 */
exports.route = (path, createNew=true) => {
	if (path[0] !== "/")
		path = "/" + path;

	if (this.searchMode === "dynamic") {
		for (let i = 0; i < this.routes.length; i++) {
			if (this.routes[i].path === path)
				return this.routes[i];
		}
	} else if (this.routes[path])
		return this.routes[path];

	if (!createNew)
		return null;

	const route = new Route(path);

	if (this.searchMode === "dynamic")
		this.routes.push(route);
	else
		this.routes[path] = route;

	return route;
};

/**
 * Moves the routes containing path parameters or a wildcard to the end of the routes array, allowing the router to find every other matching route first
 * This is useful if you want to add separate handler functions to certain parameter values
 * (SETUP)
 */
exports.reorder = () => {
	const paramRoutes = [], wildcardRoutes = [];

	this.routes = this.routes.filter(route => {
		if (route.path.includes("{") && route.path.includes("}")) {
			paramRoutes.push(route);
			return false;
		} else if (route.path.includes("*")) {
			wildcardRoutes.push(route);
			return false;
		}

		return true;
	}).concat(paramRoutes, wildcardRoutes);
};

/**
 * Changes the path searching mode of the router (SETUP)
 * @param {"dynamic" | "static"} searchMode - the new search mode of the router
 * @param {Boolean} keepRoutes - determines if the router should keep the previous routes, or if it can start with a clean state
 */
exports.setSearchMode = (searchMode, keepRoutes=false) => {
	if (exports.searchMode === searchMode)
		return;

	switch (searchMode) {
		case "dynamic":
			if (keepRoutes) {
				const tempRoutes = [];

				for (const key in this.routes)
					if (this.routes.hasOwnProperty(key))
						tempRoutes.push(this.routes[key])

				this.routes = tempRoutes;
			} else
				this.routes = [];

			this.searchMode = searchMode;

			break;

		case "static":
			if (keepRoutes) {
				const tempRoutes = {};

				for (let i = 0; i < this.routes.length; i++)
					tempRoutes[this.routes[i].path] = this.routes[i];

				this.routes = tempRoutes;
			} else
				this.routes = {};

			this.searchMode = searchMode;

			break;

		default:
			emitter.emit("error", new Error(`Invalid searchMode: ${searchMode}`));
			break;
	}
};

/**
 * The master request handling function which finds the appropriate route and handler for the specified request
 * @param {IncomingMessage} req - the request object received from the client
 * @param {ServerResponse} res - the response object that will be sent to the client
 */
exports.requestHandler = async (req, res) => {
	req.path = parse(req.url).pathname;
	if (req.path[0] !== "/")
		req.path = "/" + req.path;

	emitter.emit("request", req);
	res.on("finish", () => {
		emitter.emit("response", req, res);
	});
	
	await execMiddlewares(this.middlewares, req, res);

	const upperCaseMethod = req.method.toUpperCase();

	if (this.searchMode === "dynamic") {
		const splitReqPath = splitWithoutEmptyStrings(req.path, "/");

		for (let i = 0; i < this.routes.length; i++) {
			if (this.routes[i].handlers[upperCaseMethod] === undefined && this.routes[i].handlers["ALL"] === undefined)
				continue;

			const splitRoutePath = splitWithoutEmptyStrings(this.routes[i].path, "/"), temp = {};
			if (splitReqPath.length !== splitRoutePath.length)
				continue;
			
			let result = true;

			for (let j = 0; j < splitReqPath.length; j++) {
				if (splitRoutePath[j] === "*")
					break;

				if (splitRoutePath[j] && splitRoutePath[j][0] === '{' && splitRoutePath[j][splitRoutePath[j].length - 1] === '}') {
					temp[splitRoutePath[j].slice(1, splitRoutePath[j].length - 1)] = splitReqPath[j];
					continue;
				}

				if (splitReqPath[j] !== splitRoutePath[j]) {
					result = false;
					break;
				}
			}

			if (result) {
				req.params = temp;

				const handler = this.routes[i].handlers[upperCaseMethod] || this.routes[i].handlers["ALL"];

				await execMiddlewares(this.routes[i].middlewares, req, res);
				await execMiddlewares(handler.middlewares, req, res);

				handler.handle(req, res);
				return;
			}
		}
	} else {
		const route = this.routes[req.path];

		if (route && route.handlers[upperCaseMethod]) {
			const handler = route.handlers[upperCaseMethod] || route.handlers["ALL"];

			await execMiddlewares(route.middlewares, req, res);
			await execMiddlewares(handler.middlewares, req, res);

			handler.handle(req, res);
			return;
		}
	}

	if (fallback)
		fallback(req, res);
};

/**
 * Executes a list of middlewares
 * @param {function[]} middlewares - the list of middlewares that should be called
 * @param {IncomingMessage} req - the request object received from the client
 * @param {ServerResponse} res - the response object that will be sent to the client
 * @returns {Promise} - A promise which resolves if the middlewares have finished executing
 */
function execMiddlewares(middlewares, req, res) {
	return new Promise(resolve => {
		if (middlewares.length === 0)
			resolve();

		let i = 0;
		
		function callNext() {
			if (++i === middlewares.length) {
				resolve();
				return;
			}

			middlewares[i](req, res, callNext);	
		}
		
		middlewares[0](req, res, callNext);
	});
}

/**
 * Adds middleware function (or multiple middleware functions) to every route (SETUP)
 * @param  {...function} middlewares - middleware function(s) that should be added to the router
 */
exports.addMiddleware = (...middlewares) => {
	this.middlewares.push(...middlewares);
}

/**
 * A request handler that is called when no other route matches the request's path
 * @type {function}
 * @param {IncomingMessage} req - the request object received from the client
 * @param {ServerResponse} res - the response object that will be sent to the client
 */
let fallback = (req, res) => {
	res.writeHead(404, {"Content-Type": "text/html"});
	res.end(responses["404"]);
};

/**
 * Sets the default 404 page
 * @param {function} handler - the function which should be called if no other route matches the request's path
 */
exports.setFallback = handler => {
	fallback = handler;
}

/**
 * Gets the response of an error message
 * @param {"400b" | "400q" | "400c" | "404" | "415" | "500"} errorType - the error code (and type) of the response
- */
exports.getResponse = errorType => {
	return responses[errorType];
}

/**
 * Changes the default error messages (SETUP)
 * @param {400b" | "400q" | "400c" | "404" | "415" | "500"} errorType - the error code (and type) of the response
 * @param {String} response - the response text that should be sent
 */
exports.setResponse = (errorType, response) => {
	responses[errorType] = response;
}

/**
 * Adds an event listener to the specified event
 * @param {"request" | "response" | "error"} event - name of the event
 * @param {function} listener - the listener that should be appended to the event
 */
exports.addEventListener = (event, listener) => {
	emitter.on(event, listener);
}

// -----------------
// |   UTILITIES   |
// -----------------

/**
 * Splits a string into an array, separating elements by the specified separator without adding an empty string in the beginning or the end
 * NOTE: This only works with single-letter separators
 * @param {String} data - the string that should be parsed into an array
 * @param {String} separator - the string which separates the elements
 * @returns {String[]} the array which the string was parsed into
 */
function splitWithoutEmptyStrings(data, separator) {
	const result = [];
	
	let buffer = "";
	for (let i = 0; i < data.length; i++) {
		if (data[i] === separator) {
			if (!(buffer === "" && (i === 0  || i === data.length - 1))) {
				result.push(buffer);
			}
			buffer = "";
		} else {
			buffer += data[i];
		}
	}

	if (buffer !== "")
		result.push(buffer);
	
	if (result.length === 0)
		result.push(data);

	return result;
}

/**
 * Returns whether or not debug mode is enabled
 * @returns {Boolean} true if debug mode is enabled, false otherwise
 */
exports.getDebugMode = () => {
	return debugMode;
};

/**
 * Either enables or disables debug mode
 * @param {Boolean} [value=true] - whether debug mode should be enabled or disabled
 */
exports.setDebugMode = (value=true) => {
	if (typeof value !== "boolean")
		throw new TypeError(`Expected a Boolean value, received ${typeof value} instead`);

	debugMode = value;
};

/**
 * Sets up a route for every file in a specified directory (SETUP)
 * @param {String} path - path of the directory
 * @param {String} [root=path] - the path of where the URLs should start from (e.g. "about" -> "about/index.html", "about/style.css", etc.)
 * @param {Boolean} [recursive=true] - setup subdirectories recursively
 * @param {String} [method="GET"] - HTTP method for the routes
 * @param {Object} extensionMap - map for finding the MIME type from extensions (e.g. extensionMap["js"] -> "text/javascript")
 */
exports.autoRoute = (path, root=path, recursive=true, method="GET", extensionMap) => {
	if (!extensionMap)
		extensionMap = JSON.parse(readFileSync(join(__dirname, "type-map.json")));

	const fileList = readdirSync(path);

    for (const file of fileList) {
        if (statSync(join(path, file)).isDirectory()) {
			if (recursive) {
				this.autoRoute(join(path, file), join(root, file), recursive, method, extensionMap);
			}
        } else {
            const fileParts = file.split("."), extension = fileParts[fileParts.length - 1];
            const contentType = extensionMap[extension];

            if (contentType) {
                const content = readFileSync(join(path, file));

                this.route(join(root, file)).addHandler(method, (req, res) => {
                    res.writeHead(200, {
						"Content-Type": contentType,
						"Content-Length": Buffer.byteLength(content)
                    });
                    res.end(content);
                });
            } else {
				emitter.emit("error", new Error(`autoRoute(${path}): Skipping file: ${file}, unknown extension`));
			}
        }
    }
}

/**
 * Generates a cookie string
 * @param {String} key - key/name of the cookie
 * @param {String} value - value of the cookie
 * @param {?Object} options - the extra options which the cookie should have
 * @returns {String} the parsed cookie string
 */
exports.genCookie = (key, value, options) => {
	let c = `${key}=${value};`;
	
	if (options.domain !== undefined)
		c += ` Domain=${options.domain};`
	if (options.path !== undefined)
		c += ` Path=${options.path};`
	if (options.expires !== undefined)
		c += ` Expires=${options.expires};`
	if (options.maxAge !== undefined)
		c += ` Max-Age=${options.maxAge};`
	if (options.sameSite !== undefined)
		c += ` SameSite=${options.sameSite};`
	if (options.httpOnly)
		c += ` HttpOnly;`
	if (options.secure)
		c += ` Secure;`
	
	return c.substr(0, c.length - 1);
}
