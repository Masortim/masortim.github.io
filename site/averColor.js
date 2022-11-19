window.addEventListener("load", function(){
	var picture = document.querySelector("#cover")
	//console.log(picture);
	makeShadow(picture);
});

function getAverageRGB(cover)
{
	var rgb = {r:0, g:0, b:0},
		canvas = document.createElement('canvas'),
		ctx = canvas.getContext('2d'),
		width,
		height,
		pixels,
		length,
		pixCount;

	if (!ctx)
	{
		return rgb;
	}

	width = canvas.width = cover.offsetWidth;
	height = canvas.height = cover.offsetHeight;

	ctx.drawImage(cover, 0, 0);

	try
	{
		pixels = ctx.getImageData(0, 0, width, height);
	}
	catch(e)
	{
		return rgb;
	}

	length = pixels.data.length;

	for(i=0; i+4<=length; i+=4)
	{
		rgb.r += pixels.data[i];
		rgb.g += pixels.data[i+1];
		rgb.b += pixels.data[i+2];
	}

	pixCount = length/4;

	rgb.r = ~~(rgb.r/pixCount);
	rgb.g = ~~(rgb.g/pixCount);
	rgb.b = ~~(rgb.b/pixCount);

	return rgb;
}

function makeShadow(picture)
{
	var rgb = getAverageRGB(picture);
	var prop;

	prop = '0 0 200px 75px rgb(';
	prop += rgb.r + ',';
	prop += rgb.g + ',';
	prop += rgb.b + ')';

	picture.style.boxShadow = prop;
}