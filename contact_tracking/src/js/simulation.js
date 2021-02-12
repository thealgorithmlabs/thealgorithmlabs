(function () {
    'use strict';

    /****************
     * Simulation drawings and logics (without ball logics).
     * The simulation canvas ratio is always 3:2.
    ****************/

    var simulationCanvas, simulationDimensions, context, simulationStats, simulationEnd, simulationParameters,
        balls, currentFrame, updateInterval, resizeTimeout;

    function drawLine(color, position, dimensions) {
        var scaledPosition = position * dimensions.scaleWidthRatio;

        context.beginPath();
        context.moveTo(scaledPosition, 0);
        context.lineTo(scaledPosition, dimensions.height);
        context.closePath();

        context.strokeStyle = color;
        context.stroke();
    }

    function drawBorder(border, dimensions) {
        drawLine(border.color, border.leftWall, dimensions);
        drawLine(border.color, border.rightWall, dimensions);
    }

    function drawCanvasBoundaries(dimensions) {
        context.strokeStyle = Common.colors.canvasBoundary;
        context.strokeRect(0, 0, dimensions.width, dimensions.height);
    }

    function drawBall(ball, scaleWidthRatio) {
        var scaledCoords = ball.position.mult(scaleWidthRatio);
        var scaledRadius = Common.ball.radius * scaleWidthRatio;

        context.beginPath();
        context.arc(scaledCoords.X, scaledCoords.Y, scaledRadius, 0, Common.ball.fullRotation);
        context.closePath();

        context.fillStyle = Common.colors.states[ball.state];
        context.fill();
    }

    function resizeEventHandler() {
        // this mechanism is to prevent/delay many drawings of the same things when resizing the browser
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function() {
            draw();
        }, Common.simulation.intervalMs);
    }

    function shuffleBalls() {
        // Fisher–Yates shuffle (https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle)
        for (var i=0; i<balls.length; i++) {
            var rand = parseInt(Math.random() * balls.length);
            var temp = balls[i];
            balls[i] = balls[rand];
            balls[rand] = temp;
        }
    }
    function random_shuffle_balls(a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
}

    function start() {
        // clean simulation states
        balls = [];
        currentFrame = 0;

        // create vaccinated, sick and healthy balls
        var vaccinatedAndSick = Math.min(
            simulationParameters.vaccinatedPopulation + simulationParameters.sickPopulation,
            simulationParameters.totalPopulation); // in case if more than 100% of the population is vaccinated or sick
        var ballIdx = 0;
        while (ballIdx < simulationParameters.vaccinatedPopulation) {
            var ball=new Ball(Common.states.vaccinated);
            balls.push(ball);
            ballIdx++;
        }

        while (ballIdx < vaccinatedAndSick) {
            balls.push(new Ball(Common.states.sick));
            ballIdx++;
        }

        while (ballIdx < simulationParameters.totalPopulation) {
            balls.push(new Ball(Common.states.healthy));
            ballIdx++;
        }
        // shuffle balls
        shuffleBalls();

        // make socialDistancing balls
        for (var i=0; i<simulationParameters.radarPopulation; i++)
            balls[i].radarcovid = true;
        for (var i=0; i<simulationParameters.socialDistancingPopulation; i++)
            balls[i].socialDistancing = true;

        for (var i=0; i<balls.length; i++) {
            balls[i].id = i;
        }

        // start chart
        Chart.start();

        // set interval
        updateInterval = setInterval(update, Common.simulation.intervalMs);
    }

    function draw() {
        var dimensions = {
            width: simulationDimensions.offsetWidth,
            height: simulationDimensions.offsetHeight,
            scaleWidthRatio: simulationDimensions.offsetWidth / Common.localCanvasDimensions.width
        };

        // update dimensions and clear canvas
        // the canvas is cleared when a new value is attached to dimensions (no matter if a same value)
        simulationCanvas.width = dimensions.width;
        simulationCanvas.height = dimensions.height;

        // draw borders
        drawBorder(Common.borders.left, dimensions);
        drawBorder(Common.borders.right, dimensions);

        // draw canvas boundaries
        drawCanvasBoundaries(dimensions);

        // draw dead balls (they should be under all other balls in the canvas)
        for (var i=0; i<balls.length; i++)
            if (balls[i].state == Common.states.dead)
                drawBall(balls[i], dimensions.scaleWidthRatio);

        // draw other balls
        for (var i=0; i<balls.length; i++)
            if (balls[i].state != Common.states.dead)
                drawBall(balls[i], dimensions.scaleWidthRatio);

        // draw chart
        Chart.draw();
    }

    function update() {
        // This O(N^2) method could be faster using
        // Binary Space Partitioning (https://en.wikipedia.org/wiki/Binary_space_partitioning) or Quadtrees (https://en.wikipedia.org/wiki/Quadtree)
        for (var i=0; i<balls.length; i++)
            for (var j=i+1; j<balls.length; j++)
                // check collision and update states, positions & velocities
                var collision_sick = balls[i].ballsCollision(balls[j]);

        for (var i=0; i<balls.length; i++){

            if(balls[i].just_infected === true){
                balls[i].just_infected = false;
                if(balls[i].radarcovid === true){
                    var ball_contacts = balls[i].contacts.slice(-4);
                    for (var q = 0; q < ball_contacts.length; q++){
                        var ball_contact = ball_contacts[q];
                        if(balls[ball_contact].radarcovid === true)
                            console.log("pausing contact")
                            balls[ball_contact].socialDistancing = true;

                    }
                //balls[i].socialDistancing = true;

                }

            }
        }

        var statsData = {healthy: 0, sick: 0, vaccinated: 0, recovered: 0, dead: 0, radar: 0};
        for (var i=0; i<balls.length; i++) {
            // count stats
            statsData[balls[i].state]++;
            statsData["radar"]=simulationParameters.radarPopulation;



            // update ball position & velocity
            balls[i].move();

            // check canvas boundaries collision
            balls[i].canvasBoundariesCollision();

            // check borders collision
            balls[i].bordersCollision();
        }

        // update stats numbers
        simulationStats(statsData);

        // update chart
        Chart.update(statsData);

        // draw everything
        draw();

        // stop simulation if needed
        currentFrame++;
        if (currentFrame == Common.simulation.totalFrames) {
            clearInterval(updateInterval);
            window.addEventListener('resize', resizeEventHandler);
            simulationEnd();
        }
    }

    function init(simulation, chart, stats, end, parameters) {
        // init parameters
        simulationCanvas =  simulation.canvas;
        simulationDimensions = simulation.dimensions;
        context = simulationCanvas.getContext('2d');

        simulationStats = stats;
        simulationEnd = end;
        simulationParameters = parameters;

        Common.rates.vaccineEfficacy = simulationParameters.vaccineEfficacy;
        Common.rates.infectionRate = simulationParameters.infectionRate;
        Common.rates.deathRate = simulationParameters.deathRate;

        // init chart
        Chart.init(chart, simulationParameters.totalPopulation);

        start();
    }

    function clear() {
        // clear resize handler
        window.removeEventListener('resize', resizeEventHandler);
        clearTimeout(resizeTimeout);

        // clear chart
        Chart.clear();

        // clear canvas
        simulationCanvas.width = simulationCanvas.height = 0;
    }

    function restart() {
        clear();
        start();
    }

    // export Simulation (only the public methods)
    window.Simulation = {
        init: init,
        clear: clear,
        restart: restart
    };

}());