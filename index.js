/*==========================
          Requires
==========================*/
const 
    puppeteer               = require('puppeteer'),
    cliProgress             = require('cli-progress'),
    app                     = require('express')(),
    http                    = require('http').createServer(app),
    io                      = require('socket.io')(http),
    request                 = require('request'),
    gm                      = require('gm'),
    open                    = require('open')

/*==========================
    Gloval variables
==========================*/
//Constants
const 
    scriptArguments         = process.argv.slice(2),
    scanningBoundry         = scriptArguments[0],
    startTime               = new Date(),
    secondsSinceEpoch       = Math.round(startTime.getTime() / 1000),
    localhostPort           = 80,
    sitemaps                = scanningBoundry+"sitemap.xml",
    containsHashtagReg      = new RegExp("/#\w*"),
    viewporWidth            = 1920,
    viewportHeight          = 1080,
    // Between intrict and source
    maxImageSizeDifference  = 300
    puppeteerConfig = {
        'offline': false,
        'downloadThroughput': 500,
        'uploadThroughput': 500,
        'latency': 20
    },
    progressBar = new cliProgress.SingleBar({
        format: 'CLI Progress | {percentage}% || {value}/{total} Chunks || ETA: {eta}s',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
    })

//Lets
let 
    pagesToScan             = [],
    pagesDone               = [],
    knownImages             = [],
    alarmingImages          = [],
    images                  = [],
    pagesDoneLength         = 0
    oversizedImageId        = 0
    
// Variables actions 
pagesToScan.push(scanningBoundry);
pagesToScan.push(sitemaps);
pagesToScanLength = pagesToScan.length
pagesDoneLength = pagesDone.length

/*==========================
            GUI
==========================*/
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

http.listen(localhostPort, () => {
    open("http://localhost:"+localhostPort)
});

/*==========================
        Functions
==========================*/
function isPageType(url){
    let allowed = ["/",".html",".php",".xml"]
    let passed = false
    allowed.forEach(element => {
        if (url.endsWith(element)){
            passed = true
        }
    });
    return passed
}
//This functions solves problem of lazy loaded images not being loaded
async function autoScroll(page){
    await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
            var totalHeight = 0;
            var distance = 100;
            var timer = setInterval(() => {
                var scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if(totalHeight >= scrollHeight){
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

/*==========================
        Main loop
==========================*/
 const mainLoop = (async() => {
    // Starting script
    const browser = await puppeteer.launch();
    io.emit('reset')
    progressBar.start(pagesToScanLength, pagesDoneLength);
    // Loop through pages
    for (var index = 0;index < pagesToScanLength; index++) {
        var 
            pageURL         = pagesToScan[index],
            now             = new Date();
            
        if(!pagesDone.includes(pageURL)){
            await (async() => {
                //Prepare page
                const page = await browser.newPage();
                page.on('response', (response) => {
                    /*if(response.status() != 200){
                        return -1;
                    }
                    */
                })

                await page.setViewport({
                    width: viewporWidth,
                    height: viewportHeight
                });
                await page.goto(pageURL), {waitUntil: 'domcontentloaded'};
                
                await autoScroll(page);

                let 
                    hrefs = await page.$$eval('a', as => as.map(a => a.href)),
                    images = await page.evaluate(() => Array.from(document.images, image => [image.src, [image.clientWidth, image.clientHeight], [image.naturalWidth, image.naturalHeight]]));
                const 
                    text = await page.$eval('*', el => el.innerText);

                //io.emit('text',text)


                hrefs.forEach(href => {
                    if (href.includes(scanningBoundry) && !pagesToScan.includes(href) && !href.match(containsHashtagReg)){
                        pagesToScan.push(href)
                        //io.emit('page', href);
                    }
                });

                images.forEach(async image => {
                    if(image[2][0] - image[1][0] > maxImageSizeDifference || image[2][1] - image[1][1] > maxImageSizeDifference){
                        if(image[0].includes(scanningBoundry)){
                            io.emit('oversizedImages', [image[0],pageURL])
                            
                            alarmingImages.push(image);
                        }
                    }
                    if(image[0].endsWith('.png')){
                        if(image[0].includes(scanningBoundry)){
                            io.emit('pngs', [image[0],pageURL])
                            alarmingImages.push(image);
                        }  
                    }
                    if(image[1][1] > 900){
                        if(image[0].includes(scanningBoundry)){
                            io.emit('900bigger', [image[0],pageURL])
                            alarmingImages.push(image);
                            
                        }
                    }
                    const imageInBrowser = await browser.newPage();

                    await imageInBrowser.setViewport({
                        width: viewporWidth,
                        height: viewportHeight
                    });
                    await imageInBrowser.goto(image[0]);
                    imageInBrowser.on('requestfailed', request => {
                        io.emit('page', request.url());
                        console.log(`url: ${request.url()}, errText: ${request.failure().errorText}, method: ${request.method()}`)
                    });
                });        
                        

                pagesDone.push(pageURL)
                pagesToScanLength = pagesToScan.length
                pagesDoneLength = pagesDone.length
                progressBar.setTotal(pagesToScanLength)
                progressBar.update(pagesDoneLength)
                index = 0
                page.close();
               
            })();
        }
    }
    await browser.close();
    progressBar.stop()
 }
 )()

 
