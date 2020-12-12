# Toldi.js

*routin' u*

# Disclaimer

This framework only takes care of request routing. It does not set up or manage a web server.

# Usage

## Setup

Toldi is injected into a project using its *requestHandler* function. This should be called with a request and response object on every client request.

For example, using the http module, it would look something like this:
```javascript
const http = require("http");
const toldi = require("toldi");

http.createServer(toldi.requestHandler).listen(80);
```

## Search Mode

Toldi can use 2 different search modes: static and dynamic.

Dynamic mode uses an array to store routes and linear search to find the correct handler function when a request is received.

This allows the user to use dynamic paths. Dynamic paths are URLs that contain parts which Toldi later processes different than usual.

Dynamic URL parts:
- \* - match anything (e.g. /users/\* will match any path that starts with /users/)
- {varName} - path parameters (e.g. /users/{userId} will match any path that starts with /users/ and continues with one more word, however it will not match the path if it contains more subpaths, like /users/12c13af33e2/profile). Path parameters are stored in the request object's params property

See [Dynamic Paths](#dynamic-paths) for more details.

Static mode uses an object to store routes, which works faster, especially with more routes, but cannot handle dynamic path parts.

Search mode can be set with the *setSearchMode* function:

```javascript
setSearchMode(searchMode : "dynamic" || "static", keepRoutes : Boolean);
```

searchMode specifies which search mode to switch to. Unless keepRoutes (false by default) is set to true, Toldi will clear every route that is currently stored. The function is only meant to be used during the setup phase.

## Default responses

To change the default responses that Toldi sends the client for errors use the *setResponse* function.

```javascript
setResponse(errorType : String, response : String);
```

This sets the automatic response for *errorType* to *response*. Here's a list of possible error types: 
- 400b: malformed request body syntax
- 400q: malformed query syntax
- 400c: malformed cookie syntax
- 404: page not found
- 415: unsupported body type
- 500: internal server error

Response messages can be accessed with the *getResponse* function.

```javascript
getResponse(errorType : String);
```

This returns the response string.

## Events

Toldi emits 3 events:
- request: when a request is received
```javascript
function requestListener(request : http.IncomingMessage) {}
```
- response: when a response is sent
```javascript
function responseListener(request : http.IncomingMessage, response : http.ServerResponse) {}
```
- error: when Toldi encounters an error
```javascript
function errorListener(error : Error) {}
```

A listener can be attached to an event using the *addEventListener* function.

```javascript
addEventListener(event: "request" || "response" || "error", listener: function);
```

NOTE: The Node.js process automatically exits if no listeners are registered to an 'error' event, but on is still emitted, so it is highly recommended to attach a listener to 'error'.

```javascript
toldi.addEventListener("error", console.error);
```

## Fallback

If no route is found with the path that the client requested, a fallback function is called, which initially just responds with the default 404 response. See [default responses](#default-responses).

This behavior can be changed with the *setFallback* function.

```javascript
setFallback(handler : function);
```

This changes the fallback function to the provided *handler* function.

## Routing

### Creating and accessing a route

A route is an object which stores a path, the request handlers for its different HTTP methods, and its middlewares (see [Middlewares](#middlewares)).

The *route* function can be used to access a route.

```javascript
route(path : String, createNew : Boolean);
```

This will return the route object specified by *path*. The *createNew* argument controls whether or not Toldi should create a new route if one doesn't exist yet with the given path. *createNew* is set to true by default, so it can be omitted during setup.

If Toldi can't find a route with the provided path and *createNew* is set to false, it will return null.

### Adding a request handler to a route

A single route can contain multiple request handlers (one for each HTTP method). To add a new handler, the *addHandler* method is used.

Toldi will call the request handler function if it receives a request to the given path and with the specified method.

```javascript
route(path).addHandler(method : String, requestHandler : function, ...middlewares : function);

// Example:
route("/about").addHandler("GET", (request, response) => {
	response.end("This is the about page");
}, checkLogin);
```

NOTE: If for whatever reason you want to add a request handler to every method, use "ALL" as a method.

### Shorthands

Toldi provides shorthands for the more frequently used methods. These use the lowercase method names as function names.

For example, the code below is (in behaviour) identical to the example above.
```javascript
route("/about").get((request, response) => {
	response.end("This is the about page");
}, checkLogin);
```

There are shorthands for the following methods:
- GET
- POST
- PUT
- PATCH
- DELETE
- ALL

### Dynamic Paths

With dynamic search mode, you can use special path parts in a route's path.

If you put an asterisk in the path, it will match anything after that character.

```javascript
// Example:

route("/home/*").get((req, res) => {
	// Any request that starts with home/ will land here
});

route("*").get((req, res) => {
	// If a request matches no other route above, this will be called
	// This is (more or less) identical to setting a fallback with the setFallback function
});
```

You can also use path parameters in a route's path with the following syntax.

```javascript
// Example:

route("/users/{username}").get((req, res) => {
	// This will match any request starting with /users/ and following with exactly one path part
	
	console.log(req.params["username"]); // With /users/bela, this will output bela
});
```

### Split Handlers

Toldi provides a way to call different request handlers in different situations. These are called split handlers.

To add a split handler to a method, the *addSplitHandler* method is used.

```javascript
route(path).addSplitHandler(method : String, splitter : function, ...requestHandlers : function);
```

This will add a split handler to the specified method. The splitter is the function which will decide which handler function is called, and requestHandlers is an array of handler functions. 

Here's how Toldi processes a split handler when it receives a request:
1. It calls the splitter function with the request and response objects, expecting it to return an index.
2. It checks if the index is out of range (index < 0 || requestHandlers.length <= index)
	2a. If the index is out of range, it sends an error event, and a 500 response to the client. See [Default responses](#default-responses)
3. It calls the handler function specified by the index with the request and response objects.

Shorthands also exist for splitHandlers. They use the same function names regular handlers use, except they have the *SplitHandler* suffix (e.g. postSplitHandler). For more information see [Shorthands](#shorthands).

## Middlewares

Middlewares are functions that are called before the main request handler function is called. They are mainly used to process the request (e.g. body parsing) or to check the request for certain privileges (e.g. logged in user, admin).

A middleware function has to account for three arguments: request, response, done.
The done argument is a function that has to be called when the middleware has finished. If they are not called the processing of the request will stop, and the request handler will NOT be called.

Example middleware:
```javascript
function mw(request, response, done) {
	// Process the request

	if (error) {
		response.writeHead(200, {
			"Content-Type": "text/html",
			"Content-Length": Buffer.byteLength(error.message)
		});
		response.end(error.message);
		// The done function is not called, the request never reaches the request handler function
	} else {
		// Toldi moves on to the next middleware or to the request handler
		done();
	}
}
```

Toldi supports 3 types of middleware:

### Global Middlewares

Global middlewares are called for every request (this is good for request processing, e.g. body parsing).

They can be added with the *addMiddleware* function.

```javascript
addMiddleware(...middlewares : function);
```

You can add one or more middlewares at the same time.

### Route Specific Middlewares

Route specific middlewares are called before any method of a certain route is handled (this is good for authentication, e.g. only logged in users can see other user profiles).

They can be added with a route's *addMiddleware* method.

```javascript
route(path).addMiddleware(...middlewares : function);
```

You can add one or more middlewares at the same time.

### Method Specific Middlewares

They are called before a given method of a given route is handled. (this is good for checking user rights, e.g. only the user can modify their own profile)

They can be added with a route's *addMiddlewareToMethod* method.

```javascript
route(path).addMiddleware(method : String, ...middlewares : function);
```

You can add one or more middlewares at the same time.

### Built-in Middlewares

Toldi comes with four built-in middleware:
- body parser
- cookie parser
- query parser
- redirect adder

#### Body Parser

This middleware adds a body property to the request object, which contains the request's body in key-value pairs.

LIMITATIONS: Right now, the body parser can only process json and x-www-form-urlencoded bodies. This will probably be improved in the future, but right now if you want to deal with bodies with different encodings, you have to write your own body parser middleware.

#### Cookie Parser

This middleware adds a cookies property to the request object, which contains the request's cookies in key-value pairs.

#### Query Parser

This middleware adds a query property to the request object, which contains the query parameters found in the request's path, in key-value pairs.

#### Redirect Adder

This middleware adds a redirect function to the response object, which can be used to easily redirect the client to different pages.

```javascript
response.redirect(path : String);

// Example:
if (/* user not logged in */) {
	response.redirect("/login");
}
```

LIMITATIONS: This simply sends a 302 response to the client, with the path as the Location header. If you want to do another type of redirect (any other 3xx code), you have to do it yourself.

#### Setup

To take advantage of these middlewares the *setupMiddlewares* function is used.

```javascript
setupMiddlewares(useBodyParser : Boolean, useCookieParser : Boolean, useQueryParser: Boolean, addRedirectToResponse : Boolean);
```

The arguments are set to true by default, you only have to provide them if you don't want to use some of the middlewares.

## Utilities

### Debug Mode

Some features of Toldi can only be accessed while it's running in debug mode. These should only be used while developing, testing and debugging your server, and NOT IN PRODUCTION.

Debug mode can be enabled in one of two ways:

1. By setting the TOLDI_DEBUG environment variable to any value

   This is the advised method of enabling debug mode, as the other way can easily lead to Toldi running in debug mode in production, if the function call is not deleted from the final product.

2. Using the *setDebugMode* function

   ```javascript
   setDebugMode(value : Boolean)
   ```

   This function can be used to enable or disable debug mode. The value parameter (which defaults to **true**) specifies whether you want to enable or disable debug mode.
   **NOTE:** If you enable debug mode this way, don't forget to remove this function call before running the server in production (or more ideally, before pushing the code to a public repository).

You can always check whether or not Toldi is running in debug mode with the *getDebugMode* function. This will either return **true** or **false**.

```javascript
getDebugMode()
```

### autoRoute

Toldi can automatically set up a route for every file in a directory using the *autoRoute* function.

```javascript
autoRoute(path : String, root : String, recursive : Boolean, extensionMap : Object)
```

Toldi will go through every file in the directory specified by *path* and setup a route and a GET method handler for each one, which simply returns the file's content.
*root* is a prefix for the URL path (e.g. if there's a file named master.css in the directory and the root is /css, the file will have the following URL: /css/master.css).
If *recursive* is set to true, Toldi will also setup routes for files in subdirectories. These will have the subdirectory name in their URL (root/directory/subdirectory/file).
recursive is set to true by default, so it can be omitted in most cases.
*extensionMap* is an object that Toldi can use to get the MIME type of a certain extension (e.g. extensionMap["html"] === "text/html"). This is required for automatically setting the Content-Type header. Toldi has its own extensionMap, so you only have to provide one if you're using a file extension unknown to Toldi.

NOTE: this function is only meant to be used during server startup, because it reads its internal extensionMap from disk.

### reorder

Toldi provides a way to move every dynamic value to the end of the stored routes array. This will ensure that other (static) paths are matched first, even if they were added after the dynamic ones.

```javascript
reorder();
```
