import ytdl from "@distube/ytdl-core";
import { join } from "@std/path";
import { createWriteStream } from "node:fs";
import { Hono } from "hono";

const app = new Hono();

app.get("/", async (ctx) => {
	const htmlStr = await Deno.readTextFile(join(Deno.cwd(), "index.html"));
	return ctx.html(htmlStr);
});

app.get("/watch", async (ctx) => {
	const { searchParams } = new URL(ctx.req.url);

	if (searchParams.has("v")) {
		let videoId: string | undefined;
		const urlOrId = searchParams.get("v")!;

		if (ytdl.validateID(urlOrId)) {
			videoId = urlOrId;
		} else if (ytdl.validateURL(urlOrId)) {
			videoId = ytdl.getURLVideoID(urlOrId);
		} else {
			return new Response("Invalid video URL or ID", { status: 400 });
		}

		const filePath = join(Deno.cwd(), "downloads", videoId + ".mp4");
		let fileExists: boolean | undefined;

		try {
			const stats = await Deno.stat(filePath);
			fileExists = stats.isFile;
		} catch {
			fileExists = false;
		}

		if (!fileExists) {
			console.log("Downloading video", videoId);

			const info = await ytdl.getInfo(videoId);
			const audioFormats = ytdl.filterFormats(info.formats, "audioonly");

			if (audioFormats.length > 0) {
				const download = ytdl.downloadFromInfo(info, {
					format: audioFormats[0],
				});

				const writeStream = createWriteStream(filePath);
				download.pipe(writeStream);

				await new Promise((resolve, reject) => {
					writeStream.on("finish", resolve);
					writeStream.on("error", reject);
				});
			} else {
				throw Error("No audio formats found");
			}
		}

		console.log("Reading file from disk");
		const fileContents = await Deno.readFile(filePath);
		return ctx.body(fileContents, {
			status: 200,
			headers: { "Content-Type": "video/mp4" },
		});
	} else {
		return ctx.status(400);
	}
});

app.onError((err, c) => {
	console.error(err);
	return c.text(`Unknown error occured: ${String(err)}`, 500);
});

Deno.serve(app.fetch);
