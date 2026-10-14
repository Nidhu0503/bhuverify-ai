"""Wrap an already-rendered synthetic scan, with no recoverable text layer."""
import sys
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

source, destination = sys.argv[1:]
pdf = canvas.Canvas(destination, pagesize=A4)
pdf.setTitle("Fictional test document - not a government record")
pdf.setAuthor("BhuVerify synthetic evaluation pack")
pdf.drawImage(source, 0, 0, width=A4[0], height=A4[1])
pdf.showPage()
pdf.save()
