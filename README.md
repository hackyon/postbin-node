PostBin in Node.js
================================================================

Capture the raw HTTP requests sent to a URL, so you can debug the stuff you get from webhooks. Based on the [PostBin/RequestBin](http://requestb.in/) written in Python. Made with Node.js and Express.js, postbin-node is a more visually pleasing alternative to nc -l or tcpdump -x.

Each bin stores a maximum of 10 requests. Bins are removed if they have not been accessed for at least 48 hours.

There is also support for [HTML5 WebSockets](http://en.wikipedia.org/wiki/WebSocket)! Now you can see the frames and raw data sent through a WebSocket. The demo is available at /websocket.html once you've clone the repo and run the project locally. The online demo does not support WebSockets because it runs on Heroku's Cedar stack.

Contributions and suggestions are welcome. They're encouraged, actually.


How to Run on localhost
--------------------------------------
Run postbin-node the same way you run any other Express.js application. The entire process should not take more than a couple minutes. 

Step-by-step instructions:

1. Install [Node.js and npm](https://github.com/joyent/node/wiki/Installation)
2. ```git clone https://github.com/badassdon/postbin-node.git```
3. ```cd postbin-node```
4. ```npm install```
5. ```node app.js```
6. See it in action at [http://localhost:3000](http://localhost:3000/)


License
--------------------------------------
The source is freely available under the terms of the MIT License. 

Feel free to download, modify, and use for personal or commercial projects. I would appreciate a pingback if you find the project useful, but it's certainly not required. 


Credits
--------------------------------------
Based on [RequestBin](http://requestb.in/) by Jeff Lindsay. 

Created by [Donald Lau](http://www.badassdon.com).

