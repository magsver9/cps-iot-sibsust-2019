var http = require("http").createServer(handler); // on req - hand
var fs = require("fs"); // variable for file system for providing html
var firmata = require("firmata");
const WebSocket = require('ws'); // for permanent connection between server and client

const wss = new WebSocket.Server({port: 8888}); // websocket port is 8888

wss.broadcast = function broadcast(data) {
  wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
    client.send(data);
      }
  });
};

var messageJSON;

var controlAlgorithmStartedFlag = 0; // variable for indicating weather the Alg has benn sta.
var intervalCtrl; // var for setInterval in global scope

console.log("Starting the code");

var board = new firmata.Board("/dev/ttyACM0", function(){
    console.log("Connecting to Arduino");
    console.log("Enabling analog Pin 0");
    board.pinMode(0, board.MODES.ANALOG); // analog pin 0
    board.pinMode(1, board.MODES.ANALOG); // analog pin 1
    board.pinMode(2, board.MODES.OUTPUT); // direction of DC motor
    board.pinMode(3, board.MODES.PWM); // PWM of motor i.e. speed of rotation
    board.pinMode(4, board.MODES.OUTPUT); // direction DC motor
});

function handler(req, res) {
    fs.readFile(__dirname + "/example15.html",
    function (err, data) {
        if (err) {
            res.writeHead(500, {"Content-Type": "text/plain"});
            return res.end("Error loading html page.");
        }
    res.writeHead(200);
    res.end(data);
    })
}

var desiredValue = 0; // desired value var
var actualValue = 0; // variable for actual value (output value)

var Kp = 0.55; // proportional factor of PID controller
var Ki = 0.008; // integral factor of PID controller
var Kd = 0.15; // differential factor of PID controller

var factor = 3; // proportional factor that determines speed of resonse
var pwm = 0; // set pwm as global variable
var pwmLimit = 254; // to limit value of the pwm that is sent to the motor

var err = 0; // error
var errSum = 0; // sum of errors as integral
var dErr = 0; // difference of error
var lastErr = 0; // to keep the value of previous error to estimate derivative

http.listen(8080); // server will listen on port 8080

board.on("ready", function() {
    
    board.analogRead(0, function(value){
        desiredValue = value; // continuous read of analog pin 0
    });
    board.analogRead(1, function(value) {
        actualValue = value; // continuous read of pin A1
    });
    
    startControlAlgorithm(); // to start control alg.
    
    wss.on('connection', function (ws, req) { // start of wss code
        messageJSON = {"type": "message", "content": "Srv connected, board OK"};
        ws.send(JSON.stringify(messageJSON));
        setInterval(sendValues, 40); // on 40ms we send message to client
        
        ws.on("message", function (msgString) { // message comes as string -> msgString
            var msg = JSON.parse(msgString); // string from ws which comes as a string is put to JSON
            switch(msg.type) {
                case "startControlAlgorithm":
                    startControlAlgorithm();
                break;
                case "stopControlAlgorithm":
                    stopControlAlgorithm();                
                break;
            }
        }); // end of wss.on code
    }); // end of sockets.on connection

}); // end of board.on(ready)

function controlAlgorithm () {
    err = desiredValue - actualValue; // error as difference between desired and actual val.
    errSum += err; // sum of errors | like integral
    dErr = err - lastErr; // difference of error
    pwm = Kp*err+Ki*errSum+Kd*dErr; // PID expression
    lastErr = err; // save the value of error for next cycle to estimate the derivative
    if(pwm > pwmLimit) {pwm = pwmLimit}; // to limit the value for pwm / positive
    if(pwm < -pwmLimit) {pwm = -pwmLimit}; // to limit the value for pwm / negative
    if (pwm > 0) {board.digitalWrite(2,1); board.digitalWrite(4,0);}; // determine direction if > 0
    if (pwm < 0) {board.digitalWrite(2,0); board.digitalWrite(4,1);}; // determine direction if < 0
    board.analogWrite(3, Math.abs(pwm));
};

function startControlAlgorithm () {
    if (controlAlgorithmStartedFlag == 0) {
        // reset parameters
        pwm = 0; // Reset Pulse Width Modulation value
        err = 0; // Reset error
        errSum = 0; // Reset sum of errors as integral
        dErr = 0; // Reset difference of error
        lastErr = 0; // Reset value whih keeps the value of previous error to estimate derivative
        controlAlgorithmStartedFlag = 1;
        intervalCtrl = setInterval(function(){controlAlgorithm();}, 30); // call the alg. on 30ms
        console.log("Control algorithm has been started.");        
    }
};

function stopControlAlgorithm () {
    clearInterval(intervalCtrl); // clear the interval of control algorihtm
    board.analogWrite(3, 0);
    controlAlgorithmStartedFlag = 0;
    console.log("Control algorithm has been stopped.");
};

function sendValues () {
    wss.broadcast(JSON.stringify({"type": "clientReadValues", "desiredValue": desiredValue, "actualValue": actualValue, "error": (desiredValue - actualValue), "pwm": (pwm).toFixed(0)}));
};