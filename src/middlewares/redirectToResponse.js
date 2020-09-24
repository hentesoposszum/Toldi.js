/**
 * Adds a redirect function to the response object
 * @param {IncomingMessage} req - the request object coming from the client
 * @param {ServerResponse} res - the response object that the server will send back
 * @param {function} done - the callback function the middleware calls once it's finished processing the request
 */
module.exports = (req, res, done) => {
	res.redirect = path => {
		res.writeHead(302, { "Location": path });
		res.end();
	}
	
	done();
}