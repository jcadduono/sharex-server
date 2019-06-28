#!/usr/bin/env node

const express = require('express')
const fileUpload = require('express-fileupload')
const fs = require('fs-extra')
const path = require('path')
const config = require('./config.json')

const app = express()
app.use(fileUpload({
	limits: { fileSize: config.max_size_mb * 1024 * 1024 },
}))

const storage = config.store_directory
const site = config.site
const url = config.url_prefix

const name_possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('')
var name_len = config.min_length

app.post('/upload', async (req, res) => {
	if (!req.headers.password || req.headers.password !== config.password)
		return res.status(403).send('invalid password').end()

	if (!req.files || Object.keys(req.files).length == 0 || !req.files.file)
		return res.status(400).send('no file was uploaded').end()

	if (req.files.file.truncated)
		return res.status(400).send('file was too large, must be under 50MB').end()

	if (!req.files.file.name)
		return res.status(400).send('a file must have a name').end()

	const ext = path.extname(req.files.file.name)
	if (!ext)
		return res.status(400).send('a file must have an extension').end()

	try {
		res.status(200)
		const fname = await generateFilename(ext).catch(error => { console.error(error); throw error; })
		req.files.file.mv(`${storage}/${fname}`, function(err) {
			if (err)
				return res.status(500).send(`failed to store file on host: ${err}`).end()

			console.log(`stored uploaded file '${req.files.file.name}' as '${fname}'`)
			res.send({
				url: `${site}${url}/${fname}`
			})
		})
	} catch (err) {
		return res.status(500).send(`failed to store file on host: ${err}`).end()
	}
})

async function generatesxcu() {
	try {
		await fs.writeFile(`${storage}/share.sxcu`, JSON.stringify({
			'Version': '12.4.1',
			'DestinationType': 'FileUploader',
			'RequestMethod': 'POST',
			'RequestURL': `${site}/upload`,
			'Body': 'MultipartFormData',
			'Headers': {
				'password': ''
			},
			'FileFormName': 'file',
			'URL': '$json:url$'
		}))
		console.log(`created sxcu file at: ${site}${url}/share.sxcu`)
	} catch (err) {
		console.log(`failed to generate sxcu file: ${err}`)
	}
}

async function generateFilename(ext, tries = 0) {
	if (tries >= 10) {
		name_len++
		tries = 0
	}
	let name = ''
	for (let i = 0; i < name_len; i++) {
		name += name_possible[Math.floor(Math.random() * name_possible.length)]
	}
	name += ext

	const exists = await fs.exists(`${storage}/${name}`)
	if (exists) return generateFilename(ext, ++tries)

	return name
}

fs.stat(config.sock, function(err) {
	if (!err)
		fs.unlinkSync(config.sock)
	app.listen(config.sock, function() {
		fs.chmodSync(config.sock, '770')
		console.log(`sharex server listening on unix:${config.sock}`)
		generatesxcu()
	})
});
