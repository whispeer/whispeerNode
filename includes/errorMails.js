"use strict"

const Bluebird = require("bluebird");
const mailer = require("./mailer");
const clientError = require("./models/clientErrorModel");

const SEND_DELAY = 10 * 1000;

const timesAndCount = [
	{ diff: 0, count: 5000/10 },
	{ diff: 60*1000, count: 1000/10 },
	{ diff: 10*60*1000, count: 100/10 },
	{ diff: 60*60*1000, count: 50/10 },
	{ diff: 12*60*60*1000, count: 10 },
	{ diff: 24*60*60*1000, count: 1 },
]

const sendMails = () => {
	console.warn("check for error mails")

	return clientError.findAll({
		where:{ mailSent: false },
		order: [
			["createdAt", "ASC"]
		]
	}).then((entries) => {
		const byError = {}
		const now = Date.now()

		entries.forEach((entry) => {
			if (!byError[entry.errorText]) {
				byError[entry.errorText] = []
			}

			byError[entry.errorText].push(entry)
		})

		return Bluebird.all(Object.keys(byError).map((key) => {
			const val = byError[key]
			const first = val[0]

			const diff = now - new Date(first.createdAt).getTime()

			const sendMail = timesAndCount.some((timeCount) => {
				console.log(`${timeCount.count} <= ${val.length + 100} && ${timeCount.diff} <= ${diff}`)
				console.log(`${timeCount.count <= val.length + 100} && ${timeCount.diff <= diff}`)
				return timeCount.count <= val.length + 100 && timeCount.diff <= diff
			})

			if (sendMail) {
				console.warn("send mail!")
				return mailer.mailAdmin(`JS Error Report! ${val.length} ${first.errorText}`,
					`${first.errorText} \n\n\n` +
					val.reduce((prev, next) => {
						return `${prev} \n\n ${next.headers}`
					}, "")
				).then(() => {
					const ids = val.reduce((prev, next) => {
						prev.push(next.id)
						return prev
					}, [])

					console.warn(`send mail for ids: ${ids}`)

					return clientError.update(
						{ mailSent: true },
						{ where: { id: { $in: ids } } }
					)
				})
			}
		}))
	})
}

const continouslySendMails = () => {
	Bluebird.resolve(sendMails()).finally(() => {
		return Bluebird.delay(SEND_DELAY).then(() => {
			continouslySendMails()
		})
	})
}

module.exports = () => {
	continouslySendMails()
}
