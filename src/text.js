var runs = require('./runs');
var fontCache = {};
var wordSpacing = 0;

/*  Returns a font CSS/Canvas string based on the settings in a run
 */
var getFontString = exports.getFontString = function(run) {
    var size = (run && run.size) || runs.defaultFormatting.size;
    if (run) {
        switch (run.script) {
            case 'super':
            case 'sub':
                size *= 0.8;
                break;
        }
    }

    return (run && run.italic ? 'italic ' : '') +
           (run && run.bold ? 'bold ' : '') + ' ' +
            size + 'pt ' +
          ((run && run.font) || runs.defaultFormatting.font);
};

/*  Applies the style of a run to the canvas context
 */
exports.applyRunStyle = function(ctx, run) {
    ctx.fillStyle = (run && run.color) || runs.defaultFormatting.color;
    ctx.font = getFontString(run);
};

exports.prepareContext = function(ctx) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
};

/* Generates the value for a CSS style attribute
 */
exports.getRunStyle = function(run) {
    var parts = [
        'font: ', getFontString(run),
      '; color: ', ((run && run.color) || runs.defaultFormatting.color)
    ];

    if (run) {
        switch (run.script) {
            case 'super':
                parts.push('; vertical-align: super');
                break;
            case 'sub':
                parts.push('; vertical-align: sub');
                break;
        }
    }

    return parts.join('');
};

var nbsp = exports.nbsp = String.fromCharCode(160);
var enter = exports.enter = nbsp; // String.fromCharCode(9166);
var averageWidth = null;

/*  Returns width, height, ascent, descent in pixels for the specified text and font.
    The ascent and descent are measured from the baseline. Note that we add/remove
    all the DOM elements used for a measurement each time - this is not a significant
    part of the cost, and if we left the hidden measuring node in the DOM then it
    would affect the dimensions of the whole page.
 */
var measureText = exports.measureText = function(text, style, recursing) {
    var span, block, div;

    span = document.createElement('span');
    block = document.createElement('div');
    div = document.createElement('div');

    block.style.display = 'inline-block';
    block.style.width = '1px';
    block.style.height = '0';

    div.style.visibility = 'hidden';
	// div.style.zIndex = 1000000;
    div.style.position = 'absolute';
    div.style.top = '0';
    div.style.left = '0';
    div.style.width = '1500px';
    div.style.height = '1500px';
    div.appendChild(span);
    div.appendChild(block);
    document.body.appendChild(div);
    try {
        span.setAttribute('style', style);

        span.innerHTML = '';
        span.appendChild(document.createTextNode(text.replace(/\s/g, nbsp)));

        var result = {};
        block.style.verticalAlign = 'baseline';
        result.ascent = (block.offsetTop - span.offsetTop);
        block.style.verticalAlign = 'bottom';
        result.height = (block.offsetTop - span.offsetTop);
        result.descent = result.height - result.ascent;
        result.width = span.offsetWidth;
    } finally {
        div.parentNode.removeChild(div);
        div = null;
    }
	
	// Hack to apply word spacing. 
	// Uses the width of an uppercase O as an average width to apply the word spacing to.
	var averageWidth;
	wordSpacing = runs.defaultFormatting.wordSpacing;
	if (recursing !== true && runs.defaultFormatting.wordSpacing !== undefined) {
		averageWidth = letterCache('O', style, true).width;
		var spacedWidth = parseInt(averageWidth * runs.defaultFormatting.wordSpacing / 100, 10);
		var difference = spacedWidth - averageWidth;
		result.width = parseInt(result.width, 10) + parseInt(difference, 10);
	}
	
    return result;
};

/*  Create a function that works like measureText except it caches every result for every
    unique combination of (text, style) - that is, it memoizes measureText.

    So for example:

        var measure = cachedMeasureText();

    Then you can repeatedly do lots of separate calls to measure, e.g.:

        var m = measure('Hello, world', 'font: 12pt Arial');
        console.log(m.ascent, m.descent, m.width);

    A cache may grow without limit if the text varies a lot. However, during normal interactive
    editing the growth rate will be slow. If memory consumption becomes a problem, the cache
    can be occasionally discarded, although of course this will cause a slow down as the cache
    has to build up again (text measuring is by far the most costly operation we have to do).
*/
var createCachedMeasureText = exports.createCachedMeasureText = function() {
    return function(text, style, recursing) {
		// if (runs.defaultFormatting.font === 'sans-serif') {
		//	return {ascent: 0, height: 0, descent: 0, width: 0};
		// }
		
		if (runs.defaultFormatting.useCache === false) {
			result = measureText(text, style, recursing);
		} else {
		
			var cachedForFont = fontCache[runs.defaultFormatting.font];
			var cachedForSize;
			var cache;					
				
			if (cachedForFont !== undefined && cachedForFont !== null) {
				cachedForSize = cachedForFont[runs.defaultFormatting.size];
			} else {
				fontCache[runs.defaultFormatting.font] = {};
			}
			
			if (cachedForSize !== undefined) {
				cache = cachedForSize[text];
			} else {
				fontCache[runs.defaultFormatting.font][runs.defaultFormatting.size] = {};
			}
			
			// Measuring text with bestFit at the moment.
			if (cache !== undefined && runs.defaultFormatting.wordSpacing === wordSpacing) {		
				result = cache;
			} else {			
				result = measureText(text, style, recursing);
				fontCache[runs.defaultFormatting.font][runs.defaultFormatting.size][text] = result;
			}
		}
		// Hack to apply the lineSize to cache. This only works for one size per document.
		// Applied every time as the cache sizes are based on a lineHeight of 100%;
		lineHeight = runs.defaultFormatting.lineHeight;
		var finalResult = JSON.parse(JSON.stringify(result));
		if (runs.defaultFormatting.lineHeight !== undefined) {
			finalResult.ascent = parseInt(finalResult.ascent * lineHeight / 100, 10);
			finalResult.descent = parseInt(finalResult.descent * lineHeight / 100, 10);
			finalResult.height = finalResult.ascent + finalResult.descent;
		}	
		
        return finalResult;
    };
};
var letterCache = createCachedMeasureText();
exports.cachedMeasureText = createCachedMeasureText();

exports.setCache = function (cache) {
	fontCache = cache;
};

exports.measure = function(str, formatting) {
    return exports.cachedMeasureText(str, exports.getRunStyle(formatting));
};

exports.draw = function(ctx, str, formatting, left, baseline, width, ascent, descent) {
    exports.prepareContext(ctx);
    exports.applyRunStyle(ctx, formatting);
    switch (formatting.script) {
        case 'super':
            baseline -= (ascent * (1/3));
            break;
        case 'sub':
            baseline += (descent / 2);
            break;
    }
    ctx.fillText(str === '\n' ? exports.enter : str, left, baseline);
    if (formatting.underline) {
        ctx.fillRect(left, 1 + baseline, width, 1);
    }
    if (formatting.strikeout) {
        ctx.fillRect(left, 1 + baseline - (ascent/2), width, 1);
    }
};
