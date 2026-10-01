const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const {
	LANGUAGES, UPLOADS_DIR, IMAGES_DIR, META_DIR, OG_FILE, WEBCLIP_FILE, OG_WIDTH, OG_HEIGHT,
	imageName, bodyFigures, today, lastDate, prepareContent, renderPages, setImageVersion
} = require('./render.js');

// build settings
const ROOT = __dirname;
// everything the cms writes sits here, apart from the pages the build lays down in the root. the
// catalog, the events and the issues are folders of one file each, the pages single files
const CONTENT_DIR = 'content';
const ARCHIVE_DIR = 'catalog';
const EVENTS_DIR = 'events';
const ISSUES_DIR = 'journal';
const ABOUT_FILE = 'about.json';
const EVENTS_FILE = 'events.json';
// everything the pages are made from, gathered into one file for the cms preview to read
const BUNDLE_FILE = 'assets/content.json';
// what each upload looked like when its copies were made, and how big the copies came out. git keeps
// no dates, so a fresh checkout (which is every github build) makes every upload look newer than
// its copies. the fingerprint says whether a picture has really changed
const MANIFEST_FILE = 'assets/images/manifest.json';
const OG_QUALITY = 85;
const SOURCE_TYPES = ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp'];
const THUMB_SIZE = 800;
const FULL_SIZE = 2000;
const THUMB_QUALITY = 70;
const FULL_QUALITY = 80;
function isOutdated(source, output) {
	if (process.argv.includes('--force') || !fs.existsSync(output)) {
		return true;
	}
	return fs.statSync(source).mtimeMs > fs.statSync(output).mtimeMs;
}

// a sharing card of the size and format the scrapers want, from the artwork in meta
async function convertMeta() {
	let source = path.join(ROOT, META_DIR, 'opengraph.png');
	let output = path.join(ROOT, IMAGES_DIR, OG_FILE);
	if (!fs.existsSync(source) || !isOutdated(source, output)) {
		return 0;
	}
	fs.mkdirSync(path.join(ROOT, IMAGES_DIR), {recursive: true});
	await sharp(source)
		.resize(OG_WIDTH, OG_HEIGHT, {fit: 'cover'})
		.jpeg({quality: OG_QUALITY})
		.toFile(output);
	return 1;
}

// safari and the search engines ask the root for these by name before they read any link tag, and
// a site without them is shown as the first letter of its domain
async function convertIcons() {
	let converted = 0;
	let favicon = path.join(ROOT, META_DIR, 'favicon.png');
	let ico = path.join(ROOT, 'favicon.ico');
	if (fs.existsSync(favicon) && isOutdated(favicon, ico)) {
		// an ico can carry a png as it is: a 6 byte header, one 16 byte directory entry, then the png
		let png = fs.readFileSync(favicon);
		let {width, height} = await sharp(png).metadata();
		let head = Buffer.alloc(22);
		head.writeUInt16LE(0, 0);
		head.writeUInt16LE(1, 2); // an icon
		head.writeUInt16LE(1, 4); // with one image
		head.writeUInt8(width >= 256 ? 0 : width, 6); // 0 stands for 256
		head.writeUInt8(height >= 256 ? 0 : height, 7);
		head.writeUInt16LE(1, 10); // colour planes
		head.writeUInt16LE(32, 12); // bits per pixel
		head.writeUInt32LE(png.length, 14);
		head.writeUInt32LE(22, 18); // where the png starts
		fs.writeFileSync(ico, Buffer.concat([head, png]));
		converted++;
	}
	let webclip = path.join(ROOT, META_DIR, WEBCLIP_FILE);
	let touch = path.join(ROOT, 'apple-touch-icon.png');
	if (fs.existsSync(webclip) && isOutdated(webclip, touch)) {
		await sharp(webclip).resize(180, 180).png().toFile(touch);
		converted++;
	}
	return converted;
}

// a picture's fingerprint, read from its contents rather than its date
function fingerprint(file) {
	return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

function readManifest() {
	let file = path.join(ROOT, MANIFEST_FILE);
	return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

// compressed webp copies, originals in uploads are never touched. an upload is only converted when it
// is new or its contents have changed since its copies were made, or when the build is run with --force
async function convertImages(manifest) {
	let uploads = path.join(ROOT, UPLOADS_DIR);
	let images = path.join(ROOT, IMAGES_DIR);
	if (!fs.existsSync(uploads)) {
		return 0;
	}
	fs.mkdirSync(images, {recursive: true});

	let sizes = [
		{suffix: 'thumb', size: THUMB_SIZE, quality: THUMB_QUALITY},
		{suffix: 'full', size: FULL_SIZE, quality: FULL_QUALITY}
	];
	let force = process.argv.includes('--force');

	let converted = 0;
	let present = new Set();
	for (let file of fs.readdirSync(uploads)) {
		if (!SOURCE_TYPES.includes(path.extname(file).toLowerCase())) {
			continue;
		}
		present.add(file);
		let source = path.join(uploads, file);
		let name = imageName(file);
		let outputs = sizes.map(size => path.join(images, `${name}-${size.suffix}.webp`));
		let hash = fingerprint(source);
		let known = manifest[file];
		let made = outputs.every(output => fs.existsSync(output));
		if (!force && made && known && known.hash == hash) {
			continue;
		}
		// copies made before there was a manifest are taken as they are, as long as they are newer than
		// their upload, and only measured
		if (!force && made && !known && outputs.every(output => !isOutdated(source, output))) {
			let entry = {hash};
			for (let i = 0; i < sizes.length; i++) {
				let metadata = await sharp(outputs[i]).metadata();
				entry[sizes[i].suffix] = {width: metadata.width, height: metadata.height};
			}
			manifest[file] = entry;
			continue;
		}

		// sideways exif orientations report their dimensions untumbled
		let metadata = await sharp(source).metadata();
		let width = metadata.width;
		let height = metadata.height;
		if (metadata.orientation >= 5) {
			width = metadata.height;
			height = metadata.width;
		}

		let entry = {hash};
		for (let i = 0; i < sizes.length; i++) {
			let size = sizes[i];
			// lock the long edge so portraits and landscapes both fit the same box
			let lock = width >= height ? {width: size.size} : {height: size.size};
			let info = await sharp(source)
				.rotate() // applies the exif orientation instead of dropping it
				.resize({...lock, withoutEnlargement: true})
				.webp({quality: size.quality})
				.toFile(outputs[i]);
			entry[size.suffix] = {width: info.width, height: info.height};
			converted++;
		}
		manifest[file] = entry;
	}
	// an upload that has gone takes its line with it
	for (let file of Object.keys(manifest)) {
		if (!present.has(file)) {
			delete manifest[file];
		}
	}
	fs.writeFileSync(path.join(ROOT, MANIFEST_FILE), JSON.stringify(manifest, null, '\t') + '\n');
	return converted;
}

// generated images ship their dimensions, so the layout settles before anything loads. they are read
// from the manifest, which holds them for every copy it made
function imageSizes(entries, events, manifest) {
	let sizes = {};
	let files = [];
	for (let entry of entries.concat(events || [])) {
		if (entry.Thumbnail && entry.Thumbnail.File) {
			files.push(entry.Thumbnail.File);
		}
		if (entry.Image && entry.Image.File) {
			files.push(entry.Image.File);
		}
		for (let image of (entry.Archive || []).concat(entry.Images || [])) {
			files.push(image.File);
		}
		for (let article of entry.Articles || []) {
			for (let body of [article.Body, article['Body [ES]']]) {
				files.push(...bodyFigures(body).map(figure => figure.file));
			}
		}
	}

	for (let file of files) {
		if (sizes[file]) {
			continue;
		}
		let known = manifest[file] || {};
		sizes[file] = {};
		for (let size of ['thumb', 'full']) {
			if (known[size]) {
				sizes[file][size] = known[size];
			}
		}
	}
	return sizes;
}

function writePage(dir, html) {
	let full = path.join(ROOT, dir);
	fs.mkdirSync(full, {recursive: true});
	fs.writeFileSync(path.join(full, 'index.html'), html);
	console.log(`${path.join(dir, 'index.html')}`);
}

function readContent(file) {
	return JSON.parse(fs.readFileSync(path.join(ROOT, CONTENT_DIR, file), 'utf8'));
}

// every file in a folder, each carrying the name the cms knows it by, so the preview can find the
// one being edited among the rest
function readFolder(dir) {
	let full = path.join(ROOT, CONTENT_DIR, dir);
	if (!fs.existsSync(full)) {
		return [];
	}
	return fs.readdirSync(full)
		.filter(file => path.extname(file) == '.json')
		.sort()
		.map(file => ({...readContent(path.join(dir, file)), _slug: path.parse(file).name}));
}

// the four sets of content in the shape the pages are written from
function readSite() {
	return {
		catalog: {Entries: readFolder(ARCHIVE_DIR)},
		about: readContent(ABOUT_FILE),
		events: {...readContent(EVENTS_FILE), Events: readFolder(EVENTS_DIR)},
		// issues run in the order of their numbers, which the controls step through
		journal: {Issues: readFolder(ISSUES_DIR).sort((a, b) => Number(a.Number) - Number(b.Number))}
	};
}

async function build() {
	let data = readSite();
	// written before anything is filtered out or set in order, so the preview starts where the build does
	fs.writeFileSync(path.join(ROOT, BUNDLE_FILE), JSON.stringify(data));
	for (let note of prepareContent(data)) {
		console.log(`shared code: ${note}`);
	}
	let entries = data.catalog.Entries || [];
	let events = data.events.Events || [];
	let issues = data.journal.Issues || [];
	let manifest = readManifest();
	let converted = await convertImages(manifest);
	converted += await convertMeta();
	converted += await convertIcons();
	let sizes = imageSizes(entries, events.concat(issues, data.about), manifest);
	setImageVersion(file => manifest[file] ? manifest[file].hash.slice(0, 10) : '');
	// the cms preview has no way to measure the pictures, so it reads their sizes from here
	fs.writeFileSync(path.join(ROOT, IMAGES_DIR, 'sizes.json'), JSON.stringify(sizes));

	for (let language of LANGUAGES) {
		let pages = renderPages(data, language, sizes);
		writePage(language.dir, pages.index);
		writePage(path.join(language.dir, 'about'), pages.about);
		writePage(path.join(language.dir, 'events'), pages.events);
		writePage(path.join(language.dir, 'journal'), pages.notes);
	}
	let now = today();
	console.log(`${entries.length} entries, ${((data.about.Team || {}).Members || []).length} team members, ${events.filter(e => lastDate(e) >= now).length} upcoming and ${events.filter(e => lastDate(e) < now).length} past events, ${issues.length} issues`);
	console.log(`${IMAGES_DIR}: ${converted} images converted`);
}

build();
