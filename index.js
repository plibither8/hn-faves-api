// Require and instantiate fastify
const app = require('fastify')()
const x = require('x-ray')()

async function parse(id = '', comments = false, limit = 1, offset = 1) {
	if (!id || typeof id !== 'string') throw Error('invalid user id')

	const user = id.toLowerCase()
	const page = offset < 1 ? 1 : offset
	const url = `https://news.ycombinator.com/favorites?id=${user}&p=${page}&comments=${comments.toString()}`

	const selector = 'tr.athing'
	const articleId = '@id'
	const more = 'a.morelink@href'

	const body = { id: articleId }

	if (comments) {
		body.link = 'span.age a@href'
		body.user = 'a.hnuser'
	} else {
		body.title = 'a.storylink'
		body.link = 'a.storylink@href'
	}

	const list = await x(url, selector, [body])
		.paginate(more)
		.limit(limit)

	return list.map(item => ({ ...item, type: comments ? 'comment' :  'story' }))
}

async function all(id = '') {

}

app.get('/:user/:type', async (request, reply) => {
	const { user, type } = request.params
	const { all = false, limit = 1, offset = 1 } = request.query

	if (!['stories', 'comments'].includes(type))
		reply
			.code(400)
			.type('text/plain')
			.send(`Invalid type "${type}"`)

	reply
		.code(200)
		.send(await parse(user, type === 'comments', all ? Infinity : limit, offset))
})

app.get('/:user', async (request, reply) => {
	const { user } = request.params
	const { all = false, limit = 1, offset = 1 } = request.query

	reply
		.code(200)
		.send({
			stories: await parse(user, false, all ? Infinity : limit, offset),
			comments: await parse(user, true, all ? Infinity : limit, offset)
		})
})

// Home route - nothing here ;)
app.get('/', (request, reply) => {
	reply.send(
`Usage:
======

GET /:user
GET /:user/stories
GET /:user/comments

Optional query parameters:
    all=[true,false]
    limit=<Number>
    offset=<Number>`
	)
})

// Run the server
app.listen(process.env.PORT || 3000, err => {
	if (err) throw err
})
