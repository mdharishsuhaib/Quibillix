# Generates public/samples/utility-bill.pdf, a digital (text-layer) PDF bill for the PDF upload demo.
# Usage: python scripts/make-sample-pdf.py
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfgen import canvas

c = canvas.Canvas("public/samples/utility-bill.pdf", pagesize=A4)
W, H = A4
c.setFillColor(colors.HexColor("#0B5D3B"))
c.rect(0, H - 90, W, 90, fill=1, stroke=0)
c.setFillColor(colors.white)
c.setFont("Helvetica-Bold", 20)
c.drawString(40, H - 50, "BRIGHTSPARK ENERGY")
c.setFont("Helvetica", 10)
c.drawString(40, H - 68, "Manchester, UK  ·  www.brightspark-energy.example  ·  0161 000 0000")

c.setFillColor(colors.black)
y = H - 125
c.setFont("Helvetica-Bold", 11)
c.drawString(40, y, "Electricity bill")
c.setFont("Helvetica", 10)
rows = [
    ("Account", "77-2093-11"),
    ("Bill period", "1 Sep 2026 – 30 Sep 2026"),
    ("Bill date", "3 Oct 2026"),
    ("Meter reading", "14,610 (ESTIMATED)   Previous: 14,010 (ACTUAL)"),
]
for k, v in rows:
    y -= 16
    c.drawString(40, y, f"{k}:")
    c.drawString(140, y, v)

y -= 36
c.setFont("Helvetica-Bold", 10)
cols = [40, 330, 400, 480]
for x, h in zip(cols, ["DESCRIPTION", "QTY", "RATE", "AMOUNT (GBP)"]):
    c.drawString(x, y, h)
c.line(40, y - 4, W - 40, y - 4)
c.setFont("Helvetica", 10)
items = [
    ("Electricity usage (kWh)", "600", "0.2450", "147.00"),
    ("Standing charge (days)", "31", "0.6050", "18.76"),
    ("Smart meter rental", "1", "4.50", "4.50"),
    ("Late payment fee", "1", "12.00", "12.00"),
    ("Paper bill fee", "1", "2.50", "2.50"),
]
for row in items:
    y -= 18
    for x, v in zip(cols, row):
        c.drawString(x, y, v)
y -= 10
c.line(40, y, W - 40, y)
for label, amt, bold in [("SUBTOTAL", "184.76", False), ("VAT 5%", "9.24", False), ("TOTAL DUE", "194.00", True)]:
    y -= 18
    c.setFont("Helvetica-Bold" if bold else "Helvetica", 10)
    c.drawString(330, y, label)
    c.drawString(480, y, amt)

c.setFont("Helvetica-Oblique", 8)
c.setFillColor(colors.grey)
c.drawString(40, 50, "Sample bill for Quibillix demo purposes. Fictional company and account.")
c.save()
print("wrote public/samples/utility-bill.pdf")
