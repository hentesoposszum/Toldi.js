let responses;

exports.init = resps => {
	responses = resps || {};
	
	/**
	 * Body parsing middleware
	 * @param {IncomingMessage} req - the request object coming from the client
	 * @param {ServerResponse} res - the response object that the server will send back
	 * @param {function} done - the callback function the middleware calls once it's finished processing the request
	 */
	exports.bodyParser = (req, res, done) => {
		function reportInvalidSyntax() {
			res.writeHead(400, {"Content-Type": "text/html"});
			res.end(responses["400b"] || "400");
		}

		const data = [];

		if (!req.headers["content-type"]) {
			done();
			return;
		}

		req.on("data", chunk => {
			data.push(chunk);
		});

		req.on("end", () => {
			let body = data.join(""), contentType = req.headers["content-type"], separatorIndex = contentType.indexOf(";");

			if (separatorIndex !== -1)
				contentType = contentType.slice(0, separatorIndex);

			switch (contentType) {
				case "application/x-www-form-urlencoded":
					req.body = parseQuery(body, true);
					if (req.body === null)
						return reportInvalidSyntax();

					break;
				
				case "application/json":
					try {
						req.body = JSON.parse(body.trim());
					} catch (err) {
						return reportInvalidSyntax();
					}
					break;

				case undefined:
				case null:
					req.body = {};
					break;
			
				default:
					res.writeHead(415, {"Content-Type": "text/html"});
					res.end(responses["415"] || "415");
					return;
			}

			done();
		});
	}

	/**
	 * Query parsing middleware
	 * @param {IncomingMessage} req - the request object coming from the client
	 * @param {ServerResponse} res - the response object that the server will send back
	 * @param {function} done - the callback function the middleware calls once it's finished processing the request
	 */
	exports.queryParser = (req, res, done) => {
		const separatorIndex = req.url.indexOf("?");
		if (separatorIndex === -1) {
			done();
			return;
		}

		const queryString = req.url.slice(separatorIndex + 1);
		const query = parseQuery(queryString, true);

		if (query === null) {
			res.writeHead(400, {"Content-Type": "text/html"});
			res.end(responses["400q"] || "400");
			return;
		}

		req.query = query;
		done();
	};

	/**
	 * Cookie parsing middleware
	 * @param {IncomingMessage} req - the request object coming from the client
	 * @param {ServerResponse} res - the response object that the server will send back
	 * @param {function} done - the callback function the middleware calls once it's finished processing the request
	 */
	exports.cookieParser = (req, res, done) => {
		function reportInvalidSyntax() {
			res.writeHead(400, {"Content-Type": "text/html"});
			res.end(responses["400c"] || "400");
		}

		const cookies = {};

		if (!req.headers.cookie) {
			req.cookies = {};
			done();
			return;
		}

		const cookieString = req.headers.cookie;
		let keyBuffer = "", valueBuffer = "", readingKey = true;

		for (let i = 0; i < cookieString.length; i++) {
			if (readingKey && cookieString[i] === "=") {
				if (keyBuffer === "")
					return reportInvalidSyntax();

				readingKey = false;
				continue;
			}

			if (cookieString[i] === ";") {
				if (keyBuffer === "")
					return reportInvalidSyntax();

				const num = Number(valueBuffer);

				cookies[keyBuffer] = valueBuffer === "true" ? true :
									valueBuffer === "false" ? false :
									!Number.isNaN(num) ? num :
									valueBuffer;
				keyBuffer = "";
				valueBuffer = "";
				readingKey = true;

				i++;
				continue;
			}
			
			if (readingKey)
				keyBuffer += cookieString[i];
			else
				valueBuffer += cookieString[i];
		}

		if (cookieString[cookieString.length - 1] !== ";") {
			if (valueBuffer === "" || keyBuffer === "")
				return reportInvalidSyntax();

			const num = Number(valueBuffer);

			cookies[keyBuffer] = valueBuffer === "true" ? true :
								valueBuffer === "false" ? false :
								!Number.isNaN(num) ? num :
								valueBuffer;
		}


		req.cookies = cookies;
		done();
	}
}

/**
 * Parses a query string into an object
 * @param {String} queryString - The raw query string the function parses into an object
 * @param {Boolean} convertValues - Determines if the function should convert numbers and booleans into their respective types or if it should just leave them as a string
 * @returns {?Object} the parsed query object, an empty object if queryString is an empty string, or null if there is a syntax problem in queryString
 */
function parseQuery(queryString, convertValues) {
	const query = {};

	let keyBuffer = "", valueBuffer = "", readingKey = true;
	for (let i = 0; i < queryString.length; i++) {
		if (queryString[i] === "=") {
			if (keyBuffer === "")
				return null;

			readingKey = false;
			continue;
		}

		if (queryString[i] === "&" || queryString[i] === ";") {
			if (keyBuffer === "")
				return null;

			if (convertValues) {
				const num = Number(valueBuffer);

				query[keyBuffer] = valueBuffer === "true" || valueBuffer === "" ? true :
								   valueBuffer === "false" ? false :
								   !Number.isNaN(num) ? num : 
								   valueBuffer;
			}
			else
				query[keyBuffer] = valueBuffer;

			keyBuffer = "";
			valueBuffer = "";
			readingKey = true;
			continue;
		}

		if (queryString[i] === "%") {
			const hex = `${queryString[i + 1]}${queryString[i + 2]}`;
			if (!(/^([0-9a-fA-F]){2,2}$/.test(hex)))
				return null;

			const charCode = Number(`0x${hex}`);
			
			if (readingKey)
				keyBuffer += String.fromCharCode(charCode);
			else
				valueBuffer += String.fromCharCode(charCode);

			i += 2;
			continue;
		}
		
		if (readingKey)
			keyBuffer += queryString[i];
		else
			valueBuffer += queryString[i];
	}

	if (keyBuffer === "")
		return null;

	if (convertValues) {
		const num = Number(valueBuffer);

		query[keyBuffer] = valueBuffer === "true" || valueBuffer === "" ? true :
						   valueBuffer === "false" ? false :
						   !Number.isNaN(num) ? num : 
						   valueBuffer;
	}
	else
		query[keyBuffer] = valueBuffer;

	return query;
}