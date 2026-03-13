from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path("/Users/takasuharuki/dev26/tiktok-short-video-publisher-site")
ASSETS = ROOT / "assets"
SLIDES = ASSETS / "review_slides"
OUT_FILE = ASSETS / "tiktok-app-review-remotion.mp4"

W = 1280
H = 720

FONT_REG = "/System/Library/Fonts/Supplemental/Verdana.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Verdana Bold.ttf"

BG_TOP = (247, 243, 236, 255)
BG_BOTTOM = (231, 221, 208, 255)
TEXT = (31, 27, 22, 255)
MUTED = (111, 103, 95, 255)
ACCENT = (13, 124, 102, 255)
ACCENT_SOFT = (229, 244, 240, 255)
LINE = (216, 204, 187, 255)
PANEL = (255, 251, 246, 236)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)


def base_canvas() -> Image.Image:
    img = Image.new("RGBA", (W, H), BG_TOP)
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        r = int(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b, 255))
    return img


def round_rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill, outline=None, width: int = 1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def browser(draw: ImageDraw.ImageDraw, title: str, url: str) -> tuple[int, int, int, int]:
    box = (72, 96, 1208, 620)
    round_rect(draw, box, 28, fill=PANEL, outline=LINE, width=2)
    round_rect(draw, (96, 120, 1184, 168), 18, fill=(243, 237, 228, 255), outline=LINE, width=1)
    draw.ellipse((114, 137, 126, 149), fill=(207, 89, 81, 255))
    draw.ellipse((134, 137, 146, 149), fill=(221, 168, 77, 255))
    draw.ellipse((154, 137, 166, 149), fill=(94, 173, 96, 255))
    round_rect(draw, (220, 130, 820, 158), 14, fill=(255, 255, 255, 255), outline=LINE, width=1)
    draw.text((242, 136), url, font=font(15), fill=MUTED)
    draw.text((96, 188), title, font=font(28, bold=True), fill=TEXT)
    return box


def pill(draw: ImageDraw.ImageDraw, x: int, y: int, text: str):
    width = int(draw.textlength(text, font=font(15))) + 30
    round_rect(draw, (x, y, x + width, y + 32), 16, fill=ACCENT_SOFT)
    draw.text((x + 15, y + 8), text, font=font(15), fill=ACCENT)


def button(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, text: str, primary: bool = True):
    fill = ACCENT if primary else (239, 247, 244, 255)
    text_fill = (255, 255, 255, 255) if primary else ACCENT
    round_rect(draw, (x, y, x + w, y + 40), 20, fill=fill)
    tx = x + (w - int(draw.textlength(text, font=font(16, bold=True)))) // 2
    draw.text((tx, y + 10), text, font=font(16, bold=True), fill=text_fill)


def metric_card(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, title: str, body: str):
    round_rect(draw, (x, y, x + w, y + 104), 22, fill=(255, 255, 255, 232), outline=LINE, width=1)
    draw.text((x + 18, y + 18), title, font=font(18, bold=True), fill=TEXT)
    draw.text((x + 18, y + 50), body, font=font(15), fill=MUTED)


def code_block(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, lines: list[str]):
    round_rect(draw, (x, y, x + w, y + h), 20, fill=(24, 24, 24, 255))
    for idx, line in enumerate(lines):
      draw.text((x + 18, y + 18 + idx * 28), line, font=font(16), fill=(245, 247, 248, 255))


def annotate(draw: ImageDraw.ImageDraw, title: str, lines: list[str]):
    round_rect(draw, (72, 642, 1208, 700), 20, fill=(255, 252, 248, 234), outline=LINE, width=1)
    draw.text((94, 654), title, font=font(18, bold=True), fill=ACCENT)
    offset = 0
    for line in lines:
        draw.text((320 + offset, 654), line, font=font(16), fill=MUTED)
        offset += int(draw.textlength(line, font=font(16))) + 22


def slide_homepage() -> Image.Image:
    img = base_canvas()
    draw = ImageDraw.Draw(img)
    browser(draw, "Short Video Publisher public website", "https://1125haruki.github.io/tiktok-short-video-publisher-site/")
    draw.text((96, 228), "Prepare short-form uploads before they reach TikTok.", font=font(34, bold=True), fill=TEXT)
    draw.text((96, 276), "Public website with product, workflow, support, and review resources.", font=font(18), fill=MUTED)
    button(draw, 96, 326, 218, "Review Walkthrough", primary=True)
    button(draw, 330, 326, 218, "Live App Console", primary=False)
    metric_card(draw, 96, 392, 310, "Public website", "Product context, legal pages,\nand support routing.")
    metric_card(draw, 426, 392, 310, "Review walkthrough", "Mockup video plus step-by-step\nintegration explanation.")
    metric_card(draw, 756, 392, 310, "Live app console", "Separate page for TikTok Login Kit\nand draft upload.")
    pill(draw, 96, 188, "Public Website URL")
    annotate(draw, "Step 1", ["Reviewer starts on the public website,", "not on a login-only page."])
    return img


def slide_console() -> Image.Image:
    img = base_canvas()
    draw = ImageDraw.Draw(img)
    browser(draw, "Short Video Publisher live app console", "https://1125haruki.github.io/tiktok-short-video-publisher-site/demo.html")
    draw.text((96, 228), "Connect TikTok, inspect the session, and create an upload draft.", font=font(30, bold=True), fill=TEXT)
    draw.text((96, 272), "This page is the separate app surface used for the live TikTok web flow.", font=font(17), fill=MUTED)
    button(draw, 96, 320, 190, "Connect TikTok", primary=True)
    button(draw, 304, 320, 182, "Check Session", primary=False)
    metric_card(draw, 96, 390, 420, "App console actions", "Start TikTok Login Kit,\ncheck session, and create a draft upload.")
    round_rect(draw, (548, 228, 1118, 540), 24, fill=(255, 255, 255, 232), outline=LINE, width=1)
    draw.text((574, 256), "Current configuration", font=font(22, bold=True), fill=TEXT)
    pill(draw, 574, 300, "Login Kit")
    pill(draw, 700, 300, "Content Posting API")
    pill(draw, 920, 300, "video.upload")
    draw.text((574, 360), "Sample video preview and worker health are shown on the page.", font=font(17), fill=MUTED)
    draw.text((574, 404), "The reviewer can move here from the public website or review walkthrough.", font=font(17), fill=MUTED)
    annotate(draw, "Step 2", ["The reviewer opens the dedicated app page", "and starts TikTok authorization."])
    return img


def slide_session() -> Image.Image:
    img = base_canvas()
    draw = ImageDraw.Draw(img)
    browser(draw, "Connected TikTok session", "https://1125haruki.github.io/tiktok-short-video-publisher-site/demo.html?connected=1")
    round_rect(draw, (96, 228, 1118, 276), 18, fill=(233, 245, 239, 255))
    draw.text((118, 242), "TikTok connected: sandbox_creator", font=font(20, bold=True), fill=ACCENT)
    draw.text((96, 302), "After the callback, the app checks the current session and renders the account state.", font=font(17), fill=MUTED)
    code_block(
        draw,
        96,
        350,
        500,
        180,
        [
            "{",
            '  "connected": true,',
            '  "provider": "tiktok",',
            '  "user": { "display_name": "sandbox_creator" }',
            "}",
        ],
    )
    metric_card(draw, 630, 350, 436, "Session inspection", "The JSON panel confirms the connected account\nand keeps the review flow transparent.")
    annotate(draw, "Step 3", ["The app returns from Login Kit,", "then confirms the connected session."])
    return img


def slide_upload() -> Image.Image:
    img = base_canvas()
    draw = ImageDraw.Draw(img)
    browser(draw, "Create TikTok upload draft", "https://1125haruki.github.io/tiktok-short-video-publisher-site/demo.html")
    draw.text((96, 228), "Upload Draft", font=font(28, bold=True), fill=TEXT)
    draw.text((96, 268), "The public MP4 URL is submitted to the Content Posting Upload API.", font=font(17), fill=MUTED)
    draw.text((96, 318), "Public MP4 URL", font=font(16, bold=True), fill=TEXT)
    round_rect(draw, (96, 346, 700, 388), 18, fill=(255, 255, 255, 255), outline=LINE, width=1)
    draw.text((114, 359), "https://1125haruki.github.io/.../tiktok-app-review-remotion.mp4", font=font(15), fill=MUTED)
    button(draw, 96, 412, 220, "Create Upload Draft", primary=True)
    draw.text((96, 472), "Publish ID", font=font(16, bold=True), fill=TEXT)
    round_rect(draw, (96, 500, 520, 542), 18, fill=(255, 255, 255, 255), outline=LINE, width=1)
    draw.text((114, 513), "v_pub_91d0b8f_example", font=font(15), fill=MUTED)
    code_block(
        draw,
        736,
        300,
        330,
        220,
        [
            "{",
            '  "ok": true,',
            '  "publishId": "v_pub_91d0b8f_example",',
            '  "state": "DRAFT_CREATED"',
            "}",
        ],
    )
    annotate(draw, "Step 4", ["The app creates a draft upload request", "and returns a publish ID."])
    return img


def slide_status() -> Image.Image:
    img = base_canvas()
    draw = ImageDraw.Draw(img)
    browser(draw, "Publish status and final TikTok review", "https://1125haruki.github.io/tiktok-short-video-publisher-site/review.html")
    code_block(
        draw,
        96,
        238,
        460,
        230,
        [
            "{",
            '  "publishId": "v_pub_91d0b8f_example",',
            '  "status": "INBOX_READY",',
            '  "review_location": "TikTok creator inbox"',
            "}",
        ],
    )
    metric_card(draw, 592, 238, 474, "Status check", "The app can inspect the publish status using the\nreturned publish ID.")
    metric_card(draw, 592, 368, 474, "Final creator review", "The current production scope stops at the draft stage.\nThe creator completes the final review in TikTok.")
    pill(draw, 592, 506, "Mockup demo accepted")
    pill(draw, 782, 506, "Live web flow available")
    annotate(draw, "Step 5", ["The end-to-end path is visible:", "public website, live app console, draft upload, and final TikTok review."])
    return img


def build_video(slides: list[Path]) -> None:
    cmd = ["ffmpeg", "-y"]
    for slide in slides:
        cmd.extend(["-loop", "1", "-t", "4", "-i", str(slide)])
    cmd.extend(
        [
            "-filter_complex",
            f"[0:v][1:v][2:v][3:v][4:v]concat=n={len(slides)}:v=1:a=0,format=yuv420p[v]",
            "-map",
            "[v]",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "22",
            "-movflags",
            "+faststart",
            str(OUT_FILE),
        ]
    )
    subprocess.run(cmd, check=True)


def save_slide(index: int, img: Image.Image) -> Path:
    path = SLIDES / f"slide_{index:02d}.png"
    img.save(path)
    return path


def main() -> None:
    SLIDES.mkdir(parents=True, exist_ok=True)
    slides = [
        save_slide(1, slide_homepage()),
        save_slide(2, slide_console()),
        save_slide(3, slide_session()),
        save_slide(4, slide_upload()),
        save_slide(5, slide_status()),
    ]
    build_video(slides)
    print(OUT_FILE)


if __name__ == "__main__":
    main()
