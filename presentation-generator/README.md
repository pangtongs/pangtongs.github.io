# Storyfold presentation generator

This is a self-contained, browser-based presentation generator. It lives in
`presentation-generator/` and does not modify the site's root homepage.

## Run locally

From this directory:

```bash
cd presentation-generator
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in a browser.

No installation step is needed: the app is plain HTML, CSS, and JavaScript and
the included script uses Python's built-in static file server.

## Use it

1. Choose **Replace** (or drop files on the source card) to add your skills,
   notes, or research files.
2. Write what the presentation should help people do, then choose audience,
   length, and tone.
3. Select **Generate presentation** to update the deck preview.
4. Use the arrows, slide thumbnails, or left/right keyboard keys to explore the
   deck. Select **Present** for a distraction-free view.
5. Select **Download .md** to save an editable Markdown version of the deck.

The sample source library is included only as an in-app starting point; uploaded
files remain in the browser and are not sent to a service.
