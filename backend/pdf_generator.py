from __future__ import annotations
"""PDF generators for Solarix documents."""
from io import BytesIO
from datetime import datetime, timezone
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image as RLImage
from reportlab.pdfgen import canvas
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Group, Circle, PolyLine

styles = getSampleStyleSheet()
H1 = ParagraphStyle('h1', parent=styles['Heading1'], fontSize=16, textColor=colors.HexColor('#1d4ed8'), spaceAfter=8, alignment=1)
H2 = ParagraphStyle('h2', parent=styles['Heading2'], fontSize=11, textColor=colors.HexColor('#0f172a'), spaceAfter=6)
BODY = ParagraphStyle('body', parent=styles['BodyText'], fontSize=9, leading=13, textColor=colors.HexColor('#1f2937'))
SMALL = ParagraphStyle('small', parent=styles['BodyText'], fontSize=8, leading=11, textColor=colors.HexColor('#475569'))
BOLD_SMALL = ParagraphStyle('bold_small', parent=styles['BodyText'], fontSize=8, leading=11, fontName='Helvetica-Bold', textColor=colors.HexColor('#1f2937'))
HEADER_TEXT_STYLE = ParagraphStyle('header_text_style', parent=styles['BodyText'], fontSize=8, leading=11, fontName='Helvetica-Bold', textColor=colors.white)


def _header(company: dict, prepared_by: str | None = None, show_owner: bool = True):
    company_name = company.get('company_name', 'SOLARIX EPC')
    owner_name = company.get('owner_name', '')
    mobile = company.get('mobile', '')
    email = company.get('email', '')
    gst = company.get('gst_number', '') or company.get('gst', '')
    address = company.get('address', '')
    city = company.get('city', '')
    state = company.get('state', '')
    pincode = company.get('pincode', '')
    website = company.get('website', '')
    
    full_address = f"{address}"
    if city or state or pincode:
        full_address += f", {city}" if city else ""
        full_address += f", {state}" if state else ""
        full_address += f" - {pincode}" if pincode else ""
        
    lines = [
        f"<b><font size='14' color='#1d4ed8'>{company_name}</font></b>",
    ]
    if show_owner and owner_name:
        lines.append(f"Owner: {owner_name}")
    if prepared_by:
        lines.append(f"Prepared By: {prepared_by}")
    if mobile:
        lines.append(f"Mobile: {mobile}")
    if email:
        lines.append(f"Email: {email}")
    if website:
        lines.append(f"Website: {website}")
    if gst:
        lines.append(f"GSTIN: {gst}")
    if full_address:
        lines.append(f"Address: {full_address}")
        
    header_text = "<br/>".join(lines)
    header_p = Paragraph(header_text, ParagraphStyle('header_p', parent=styles['BodyText'], fontSize=9, leading=12))
    
    header_table = Table([[header_p]], colWidths=[18 * cm])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    return [header_table, Spacer(1, 0.3 * cm)]


def _kv_table(rows):
    t = Table(rows, colWidths=[5 * cm, 13 * cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f1f5f9')),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#475569')),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#6b7280')),
        ('PADDING', (0, 0), (-1, -1), 5),
    ]))
    return t


def _format_currency(value: float) -> str:
    try:
        return f"Rs. {value:,.2f}"
    except Exception:
        return "Rs. 0.00"


def _amount_to_words(amount: float) -> str:
    words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
    tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]

    def convert(num: int) -> str:
        if num < 20:
            return words[num]
        if num < 100:
            return tens[num // 10] + (" " + words[num % 10] if num % 10 else "")
        if num < 1000:
            return words[num // 100] + " hundred" + (" " + convert(num % 100) if num % 100 else "")
        if num < 100000:
            return convert(num // 1000) + " thousand" + (" " + convert(num % 1000) if num % 1000 else "")
        return convert(num // 100000) + " lakh" + (" " + convert(num % 100000) if num % 100000 else "")

    integer_part = int(amount)
    paise_part = round((amount - integer_part) * 100)
    words_out = convert(integer_part) + " rupees"
    if paise_part:
        words_out += " and " + convert(paise_part) + " paise"
    return words_out.replace("  ", " ").strip().capitalize() + " only"


def _safe_client_name(client: dict) -> str:
    return client.get("full_name") or client.get("name") or "Customer"


def _table(rows, col_widths=None, header_row=False):
    t = Table(rows, colWidths=col_widths)
    style = TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#6b7280")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ])
    if header_row:
        style.add("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a8a"))
        style.add("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold")
        style.add("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#ffffff"))
    t.setStyle(style)
    return t


def _client_table(client: dict):
    rows = [
        [Paragraph("<b>Client Name</b>", BOLD_SMALL), Paragraph(_safe_client_name(client), SMALL)],
        [Paragraph("<b>Address</b>", BOLD_SMALL), Paragraph(client.get("address", ""), SMALL)],
        [Paragraph("<b>Mobile</b>", BOLD_SMALL), Paragraph(client.get("mobile", ""), SMALL)],
        [Paragraph("<b>GSTIN</b>", BOLD_SMALL), Paragraph(client.get("gst_number", "") or "—", SMALL)],
        [Paragraph("<b>Email</b>", BOLD_SMALL), Paragraph(client.get("email", "") or "—", SMALL)],
        [Paragraph("<b>Site Address</b>", BOLD_SMALL), Paragraph(client.get("site_address", "") or client.get("address", ""), SMALL)],
    ]
    return _table(rows, col_widths=[5 * cm, 13 * cm])


def _render_items_table(doc_type: str, items: list[dict], data: dict, apply_gst: bool = True) -> Table:
    if doc_type == "tax_invoice":
        if apply_gst:
            headers = [
                Paragraph('<font color="#ffffff"><b>S.No</b></font>', HEADER_TEXT_STYLE),
                Paragraph('<font color="#ffffff"><b>Description</b></font>', HEADER_TEXT_STYLE),
                Paragraph('<font color="#ffffff"><b>Qty</b></font>', HEADER_TEXT_STYLE),
                Paragraph('<font color="#ffffff"><b>Unit</b></font>', HEADER_TEXT_STYLE),
                Paragraph('<font color="#ffffff"><b>Rate</b></font>', HEADER_TEXT_STYLE),
                Paragraph('<font color="#ffffff"><b>Taxable Value</b></font>', HEADER_TEXT_STYLE),
                Paragraph('<font color="#ffffff"><b>CGST</b></font>', HEADER_TEXT_STYLE),
                Paragraph('<font color="#ffffff"><b>SGST</b></font>', HEADER_TEXT_STYLE),
                Paragraph('<font color="#ffffff"><b>IGST</b></font>', HEADER_TEXT_STYLE),
                Paragraph('<font color="#ffffff"><b>Total</b></font>', HEADER_TEXT_STYLE),
            ]
            rows = [headers]
            for idx, row in enumerate(items, 1):
                qty = float(row.get("quantity") or 0)
                rate = float(row.get("rate") or 0)
                discount = float(row.get("discount") or 0)
                taxable = max(0.0, qty * rate - discount)
                
                cgst = float(row.get("cgst") or 0)
                sgst = float(row.get("sgst") or 0)
                igst = float(row.get("igst") or 0)
                total = float(row.get("amount") or (taxable + cgst + sgst + igst))
                
                desc_text = row.get("product", "")
                serials = row.get("serial_numbers") or row.get("serials")
                if serials:
                    desc_text += f'<br/><font size="7.5" color="#64748b">Serial: {serials}</font>'
                
                rows.append([
                    Paragraph(str(idx), SMALL),
                    Paragraph(desc_text, SMALL),
                    Paragraph(str(qty), SMALL),
                    Paragraph(row.get("unit", ""), SMALL),
                    Paragraph(_format_currency(rate), SMALL),
                    Paragraph(_format_currency(taxable), SMALL),
                    Paragraph(_format_currency(cgst), SMALL),
                    Paragraph(_format_currency(sgst), SMALL),
                    Paragraph(_format_currency(igst), SMALL),
                    Paragraph(_format_currency(total), SMALL),
                ])
            col_widths = [0.8 * cm, 4.0 * cm, 0.9 * cm, 1.0 * cm, 2.0 * cm, 2.1 * cm, 1.6 * cm, 1.6 * cm, 1.6 * cm, 2.4 * cm]
            return _table(rows, col_widths=col_widths, header_row=True)
        else:
            headers = [
                Paragraph('<font color="#ffffff"><b>S.No</b></font>', HEADER_TEXT_STYLE),
                Paragraph('<font color="#ffffff"><b>Description</b></font>', HEADER_TEXT_STYLE),
                Paragraph('<font color="#ffffff"><b>Qty</b></font>', HEADER_TEXT_STYLE),
                Paragraph('<font color="#ffffff"><b>Unit</b></font>', HEADER_TEXT_STYLE),
                Paragraph('<font color="#ffffff"><b>Rate</b></font>', HEADER_TEXT_STYLE),
                Paragraph('<font color="#ffffff"><b>Total</b></font>', HEADER_TEXT_STYLE),
            ]
            rows = [headers]
            for idx, row in enumerate(items, 1):
                qty = float(row.get("quantity") or 0)
                rate = float(row.get("rate") or 0)
                discount = float(row.get("discount") or 0)
                taxable = max(0.0, qty * rate - discount)
                
                desc_text = row.get("product", "")
                serials = row.get("serial_numbers") or row.get("serials")
                if serials:
                    desc_text += f'<br/><font size="7.5" color="#64748b">Serial: {serials}</font>'
                
                rows.append([
                    Paragraph(str(idx), SMALL),
                    Paragraph(desc_text, SMALL),
                    Paragraph(str(qty), SMALL),
                    Paragraph(row.get("unit", ""), SMALL),
                    Paragraph(_format_currency(rate), SMALL),
                    Paragraph(_format_currency(taxable), SMALL),
                ])
            col_widths = [1.0 * cm, 9.0 * cm, 1.5 * cm, 1.5 * cm, 2.5 * cm, 2.5 * cm]
            return _table(rows, col_widths=col_widths, header_row=True)
            
    if doc_type == "delivery_bill":
        show_rate = data.get("show_rate", True)
        show_amount = data.get("show_amount", True)
        
        headers = [
            Paragraph('<font color="#ffffff"><b>S.No</b></font>', HEADER_TEXT_STYLE),
            Paragraph('<font color="#ffffff"><b>Description</b></font>', HEADER_TEXT_STYLE),
            Paragraph('<font color="#ffffff"><b>Size</b></font>', HEADER_TEXT_STYLE),
            Paragraph('<font color="#ffffff"><b>Unit</b></font>', HEADER_TEXT_STYLE),
            Paragraph('<font color="#ffffff"><b>Dispatch Qty</b></font>', HEADER_TEXT_STYLE),
        ]
        if show_rate:
            headers.append(Paragraph('<font color="#ffffff"><b>Rate</b></font>', HEADER_TEXT_STYLE))
        if show_amount:
            headers.append(Paragraph('<font color="#ffffff"><b>Amount</b></font>', HEADER_TEXT_STYLE))
            
        hv_keywords = ["SOLAR PANEL", "PANEL", "INVERTER", "ACDB", "DCDB", "METER", "BATTERY"]
        def _is_hv_db(row):
            pn = (row.get("product") or "").upper()
            return row.get("high_value_goods") or row.get("high_value_asset") or any(kw in pn for kw in hv_keywords)

        sorted_items = list(items or [])
        sorted_items.sort(key=lambda r: (0 if _is_hv_db(r) else 1, (r.get("product") or "").lower(), (r.get("size") or "").lower()))

        rows = [headers]
        for idx, row in enumerate(sorted_items, 1):
            qty = float(row.get("dispatch_qty") or 0)
            rate = float(row.get("rate") or 0)
            amount = qty * rate
            
            desc_text = row.get("product", "")
            serials = row.get("serial_numbers") or row.get("serials")
            if serials:
                desc_text += f'<br/><font size="7.5" color="#64748b">Serial: {serials}</font>'
                
            r_data = [
                Paragraph(str(idx), SMALL),
                Paragraph(desc_text, SMALL),
                Paragraph(row.get("size", ""), SMALL),
                Paragraph(row.get("unit", ""), SMALL),
                Paragraph(str(qty), SMALL),
            ]
            if show_rate:
                r_data.append(Paragraph(_format_currency(rate), SMALL))
            if show_amount:
                r_data.append(Paragraph(_format_currency(amount), SMALL))
            rows.append(r_data)
            
        if show_rate and show_amount:
            col_widths = [1.0 * cm, 6.5 * cm, 2.0 * cm, 1.5 * cm, 2.0 * cm, 2.5 * cm, 2.5 * cm]
        elif show_rate:
            col_widths = [1.0 * cm, 9.0 * cm, 2.0 * cm, 1.5 * cm, 2.0 * cm, 2.5 * cm]
        elif show_amount:
            col_widths = [1.0 * cm, 9.0 * cm, 2.0 * cm, 1.5 * cm, 2.0 * cm, 2.5 * cm]
        else:
            col_widths = [1.0 * cm, 11.5 * cm, 2.0 * cm, 1.5 * cm, 2.0 * cm]
            
        return _table(rows, col_widths=col_widths, header_row=True)

    # Quotation
    custom_cols = data.get("custom_columns") or []
    formula_cols = data.get("formula_columns") or []
    num_extra = len(custom_cols) + len(formula_cols)
    extra_width = 1.5 * cm
    
    headers = [
        Paragraph('<font color="#ffffff"><b>S.No</b></font>', HEADER_TEXT_STYLE),
        Paragraph('<font color="#ffffff"><b>Description</b></font>', HEADER_TEXT_STYLE),
        Paragraph('<font color="#ffffff"><b>Size</b></font>', HEADER_TEXT_STYLE),
        Paragraph('<font color="#ffffff"><b>Unit</b></font>', HEADER_TEXT_STYLE),
        Paragraph('<font color="#ffffff"><b>Qty</b></font>', HEADER_TEXT_STYLE),
        Paragraph('<font color="#ffffff"><b>Rate</b></font>', HEADER_TEXT_STYLE),
        Paragraph('<font color="#ffffff"><b>Discount</b></font>', HEADER_TEXT_STYLE),
    ]
    if apply_gst:
        headers.append(Paragraph('<font color="#ffffff"><b>GST %</b></font>', HEADER_TEXT_STYLE))
    headers.append(Paragraph('<font color="#ffffff"><b>Amount</b></font>', HEADER_TEXT_STYLE))
    
    for c in custom_cols:
        headers.append(Paragraph(f'<font color="#ffffff"><b>{c.get("label", "Custom")}</b></font>', HEADER_TEXT_STYLE))
    for f in formula_cols:
        headers.append(Paragraph(f'<font color="#ffffff"><b>{f.get("label", "Formula")}</b></font>', HEADER_TEXT_STYLE))
        
    rows = [headers]
    for idx, row in enumerate(items, 1):
        qty = float(row.get("quantity") or 0)
        rate = float(row.get("rate") or 0)
        discount = float(row.get("discount") or 0)
        gst = float(row.get("gst") or 0)
        
        taxable = max(0.0, qty * rate - discount)
        gst_amount = taxable * gst / 100 if apply_gst else 0
        amount = float(row.get("amount") or (taxable + gst_amount))
        
        desc_text = row.get("product", "")
        serials = row.get("serial_numbers") or row.get("serials")
        if serials:
            desc_text += f'<br/><font size="7.5" color="#64748b">Serial: {serials}</font>'
            
        r_cols = [
            Paragraph(str(idx), SMALL),
            Paragraph(desc_text, SMALL),
            Paragraph(row.get("size", ""), SMALL),
            Paragraph(row.get("unit", ""), SMALL),
            Paragraph(str(qty), SMALL),
            Paragraph(_format_currency(rate), SMALL),
            Paragraph(_format_currency(discount), SMALL),
        ]
        if apply_gst:
            r_cols.append(Paragraph(f"{gst:.0f}%", SMALL))
        r_cols.append(Paragraph(_format_currency(amount), SMALL))
        
        # custom fields
        custom_data = row.get("custom") or {}
        for c in custom_cols:
            val = custom_data.get(c.get("id"), "")
            r_cols.append(Paragraph(str(val), SMALL))
            
        # formula fields
        formula_data = row.get("formula") or {}
        for f in formula_cols:
            val = formula_data.get(f.get("id"), 0)
            r_cols.append(Paragraph(_format_currency(val), SMALL))
            
        rows.append(r_cols)

    rem_width = 18.0 * cm - (num_extra * extra_width)
    if apply_gst:
        base_widths = [0.8 * cm, 4.0 * cm, 1.5 * cm, 1.0 * cm, 1.0 * cm, 2.0 * cm, 1.8 * cm, 1.4 * cm, 2.5 * cm]
    else:
        base_widths = [1.0 * cm, 4.5 * cm, 2.0 * cm, 1.2 * cm, 1.2 * cm, 2.5 * cm, 2.1 * cm, 2.5 * cm]
        
    total_base = sum(base_widths)
    scale = rem_width / total_base
    col_widths = [w * scale for w in base_widths] + [extra_width] * num_extra
    
    return _table(rows, col_widths=col_widths, header_row=True)


def _summary_table(doc_type: str, totals: dict):
    rows = [[Paragraph('<font color="#ffffff"><b>Description</b></font>', HEADER_TEXT_STYLE), Paragraph('<font color="#ffffff"><b>Amount</b></font>', HEADER_TEXT_STYLE)]]
    if doc_type == "tax_invoice" and "gst_total" in totals:
        rows.extend([
            [Paragraph("Subtotal", SMALL), Paragraph(_format_currency(totals.get("subtotal", 0)), SMALL)],
            [Paragraph("GST Total", SMALL), Paragraph(_format_currency(totals.get("gst_total", 0)), SMALL)],
            [Paragraph("<b>Grand Total</b>", BOLD_SMALL), Paragraph(_format_currency(totals.get("grand_total", 0)), BOLD_SMALL)],
        ])
    else:
        rows.extend([
            [Paragraph("<b>Total</b>", BOLD_SMALL), Paragraph(_format_currency(totals.get("total", 0)), BOLD_SMALL)],
        ])
    return _table(rows, col_widths=[13 * cm, 5 * cm], header_row=True)


def _dedupe(value: str) -> str:
    return (value or "").strip()


def generate_document(doc_type: str, data: dict, company: dict) -> bytes:
    buf = BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1.5 * cm, bottomMargin=1.5 * cm)
    
    prepared_by = data.get("prepared_by", "")
    show_owner = data.get("show_owner") is not False and str(data.get("show_owner")).lower() != "false"
    story: list = _header(company, prepared_by, show_owner)
    
    titles = {
        "quotation": "QUOTATION",
        "tax_invoice": "TAX INVOICE",
        "delivery_bill": "DELIVERY BILL",
    }
    custom_title = data.get("custom_title")
    if doc_type == "tax_invoice" and custom_title:
        title_text = str(custom_title).strip().upper()
    else:
        title_text = titles.get(doc_type, doc_type.replace("_", " ").upper())
    story.append(Paragraph(title_text, H1))
    story.append(Spacer(1, 0.2 * cm))

    client = data.get("client") or {}
    details = []
    if doc_type == "quotation":
        details = [
            [Paragraph("<b>Quotation No.</b>", BOLD_SMALL), Paragraph(data.get("quote_number", ""), SMALL)],
            [Paragraph("<b>Date</b>", BOLD_SMALL), Paragraph(data.get("quote_date", ""), SMALL)],
            [Paragraph("<b>Valid Till</b>", BOLD_SMALL), Paragraph(data.get("valid_till", ""), SMALL)],
        ]
    elif doc_type == "tax_invoice":
        details = [
            [Paragraph("<b>Invoice No.</b>", BOLD_SMALL), Paragraph(data.get("invoice_number", ""), SMALL)],
            [Paragraph("<b>Invoice Date</b>", BOLD_SMALL), Paragraph(data.get("invoice_date", ""), SMALL)],
            [Paragraph("<b>Place of Supply</b>", BOLD_SMALL), Paragraph(data.get("place_of_supply", ""), SMALL)],
        ]
    elif doc_type == "delivery_bill":
        details = [
            [Paragraph("<b>Challan No.</b>", BOLD_SMALL), Paragraph(data.get("challan_number", ""), SMALL)],
            [Paragraph("<b>Date</b>", BOLD_SMALL), Paragraph(data.get("date", ""), SMALL)],
        ]
    if details:
        story.append(_table(details, col_widths=[5 * cm, 13 * cm]))
        story.append(Spacer(1, 0.3 * cm))

    story.append(Paragraph("Customer Details", H2))
    story.append(_client_table(client))
    story.append(Spacer(1, 0.3 * cm))

    items = data.get("items") or []
    apply_gst = data.get("apply_gst", True)
    if doc_type == "delivery_bill":
        apply_gst = False
        
    story.append(_render_items_table(doc_type, items, data, apply_gst))
    story.append(Spacer(1, 0.3 * cm))

    if doc_type == "tax_invoice":
        subtotal = sum(max(0.0, float(item.get("quantity") or 0) * float(item.get("rate") or 0) - float(item.get("discount") or 0)) for item in items)
        if apply_gst:
            gst_total = sum(float(item.get("cgst") or 0) + float(item.get("sgst") or 0) + float(item.get("igst") or 0) for item in items)
            if gst_total == 0:
                gst_total = sum(max(0.0, float(item.get("quantity") or 0) * float(item.get("rate") or 0) - float(item.get("discount") or 0)) * float(item.get("gst") or 0) / 100 for item in items)
        else:
            gst_total = 0.0
        grand_total = subtotal + gst_total
        totals = {"subtotal": subtotal, "gst_total": gst_total, "grand_total": grand_total}
    elif doc_type == "quotation":
        subtotal = sum(max(0.0, float(item.get("quantity") or 0) * float(item.get("rate") or 0) - float(item.get("discount") or 0)) for item in items)
        if apply_gst:
            gst_total = sum(max(0.0, float(item.get("quantity") or 0) * float(item.get("rate") or 0) - float(item.get("discount") or 0)) * float(item.get("gst") or 0) / 100 for item in items)
        else:
            gst_total = 0.0
        totals = {"total": subtotal + gst_total}
    else:
        # delivery bill
        total = sum((float(item.get("dispatch_qty") or item.get("quantity") or 0) * float(item.get("rate") or 0)) for item in items)
        totals = {"total": total}

    show_amount = data.get("show_amount", True) if doc_type == "delivery_bill" else True

    if show_amount:
        story.append(_summary_table(doc_type, totals))
        story.append(Spacer(1, 0.3 * cm))

        if doc_type == "tax_invoice":
            story.append(Paragraph("Amount in Words", H2))
            story.append(Paragraph(_amount_to_words(totals.get("grand_total", 0)), BODY))
            story.append(Spacer(1, 0.3 * cm))
        elif doc_type == "quotation" or doc_type == "delivery_bill":
            story.append(Paragraph("Amount in Words", H2))
            story.append(Paragraph(_amount_to_words(totals.get("total", 0)), BODY))
            story.append(Spacer(1, 0.3 * cm))

    # ── Product Details (quotation only) — rendered after Amount in Words, before Notes ──
    product_details = (data.get("product_details") or "").strip()
    if doc_type == "quotation" and product_details:
        product_details_heading = (data.get("product_details_heading") or "").strip() or "Product Details"
        story.append(Paragraph(product_details_heading, H2))
        story.append(Paragraph(product_details.replace("\n", "<br/>"), BODY))
        story.append(Spacer(1, 0.3 * cm))

    notes = data.get("notes") or ""
    if notes:
        story.append(Paragraph("Notes", H2))
        story.append(Paragraph(notes.replace("\n", "<br/>"), BODY))
        story.append(Spacer(1, 0.3 * cm))
        
    terms = data.get("terms") or ""
    if terms:
        story.append(Paragraph("Terms & Conditions", H2))
        story.append(Paragraph(terms.replace("\n", "<br/>"), BODY))
        story.append(Spacer(1, 0.3 * cm))

    if doc_type == "delivery_bill":
        story.append(Paragraph("This Delivery Bill is issued for dispatch of the material above. The goods remain the property of the supplier until payment is received in full.", BODY))
        story.append(Spacer(1, 0.3 * cm))

    story.append(Spacer(1, 0.6 * cm))
    signature = Table([
        [Paragraph("<b>Receiver Signature</b>", BODY), Paragraph("<b>Authorized Signature</b>", BODY)]
    ], colWidths=[9 * cm, 9 * cm])
    signature.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(signature)

    pdf.build(story)
    return buf.getvalue()


def generate_wcr_pdf(client: dict, company: dict) -> bytes:
    buf = BytesIO()
    pdf = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.2 * cm,
        rightMargin=1.2 * cm,
        topMargin=1.0 * cm,
        bottomMargin=1.0 * cm
    )
    story = []

    # Palette & Company Specs
    company_name = company.get('company_name', 'GVP SOLAR ENERGY')
    gst_no = company.get('gst_number') or company.get('gst') or '27AAAAA0000A1Z5'
    address = company.get('address') or 'Office Address, Maharashtra'
    phone = company.get('mobile') or company.get('phone') or '+91 98765 43210'
    email = company.get('email') or 'info@gvpsolar.com'

    # Styles
    STYLE_TITLE = ParagraphStyle('wcr_title', parent=styles['Normal'], fontSize=13, fontName='Helvetica-Bold', textColor=colors.HexColor('#0f172a'), alignment=1, spaceAfter=2)
    STYLE_META = ParagraphStyle('wcr_meta', parent=styles['Normal'], fontSize=8, fontName='Helvetica', textColor=colors.HexColor('#64748b'), alignment=1, spaceAfter=6)
    STYLE_BODY_JUSTIFY = ParagraphStyle('wcr_body_j', parent=styles['Normal'], fontSize=9.5, fontName='Helvetica', textColor=colors.HexColor('#1e293b'), leading=14, alignment=4, spaceAfter=8)
    STYLE_FOOTER = ParagraphStyle('wcr_ftr', parent=styles['Normal'], fontSize=8, fontName='Helvetica', textColor=colors.HexColor('#475569'), alignment=1, leading=11)

    # 1. Header Builder
    def _build_header():
        header_text = (
            f"<b><font size='15' color='#1e3a8a'>{company_name}</font></b><br/>"
            f"<font size='8' color='#475569'><b>GSTIN:</b> {gst_no} &nbsp;|&nbsp; <b>Email:</b> {email} &nbsp;|&nbsp; <b>Phone:</b> {phone}</font><br/>"
            f"<font size='8' color='#475569'><b>Office Address:</b> {address}</font>"
        )
        p_hdr = Paragraph(header_text, ParagraphStyle('p_hdr_style', parent=styles['Normal'], alignment=1, leading=12))
        
        hdr_table = Table([[p_hdr]], colWidths=[18.6 * cm])
        hdr_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('LINEBELOW', (0, 0), (-1, -1), 1.2, colors.HexColor('#1d4ed8')),
        ]))
        return hdr_table

    # 2. Footer Builder
    def _build_footer(page_num: int):
        ftr_text = (
            f"<font size='8' color='#475569'>Office Address: {address} &nbsp;|&nbsp; <b>Phone: {phone}</b></font><br/>"
            f"<font size='7.5' color='#94a3b8'>Page {page_num} of 3 &nbsp;|&nbsp; Official EPC Engineering Document &nbsp;|&nbsp; Confidential</font>"
        )
        p_ftr = Paragraph(ftr_text, STYLE_FOOTER)
        ftr_table = Table([[p_ftr]], colWidths=[18.6 * cm])
        ftr_table.setStyle(TableStyle([
            ('LINEABOVE', (0, 0), (-1, -1), 0.8, colors.HexColor('#cbd5e1')),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ]))
        return ftr_table

    # Data Mapping
    client_name = client.get('full_name') or client.get('name') or 'Consumer Name'
    consumer_num = client.get('consumer_number') or '—'
    site_addr = f"{client.get('address','')}, {client.get('city','')}, {client.get('state','')} - {client.get('pincode','')}".strip(', -')
    category = client.get('consumer_type') or 'Private Sector'
    sanction_no = client.get('sanction_number') or 'INA'
    sol_kw = str(client.get('system_kw') or '0')
    sol_wp = str(client.get('panel_wattage') or '540')
    num_panels = str(client.get('num_panels') or '0')
    panel_make = client.get('panel_make') or 'GVP SOLAR'
    almm_model = client.get('almm_model_number') or 'INA'
    inverter_make = client.get('inverter_make') or 'GROWATT'
    inverter_kw = str(client.get('inverter_capacity') or f"{sol_kw}KW")
    inverter_sr = client.get('inverter_serial') or 'INA'
    sol_id = client.get('sol_id') or client.get('client_code') or '00100'
    date_str = datetime.now(timezone.utc).strftime('%d %b %Y')
    doc_no = f"WCR-2026-{sol_id}"

    # --- PAGE 1: 28-row Observation Table ---
    story.append(_build_header())
    story.append(Spacer(1, 0.2 * cm))

    story.append(Paragraph("<b>WORK COMPLETION REPORT FOR SOLAR POWER PLANT</b>", STYLE_TITLE))
    story.append(Paragraph(f"<b>Document No:</b> {doc_no} &nbsp;|&nbsp; <b>Date:</b> {date_str} &nbsp;|&nbsp; <b>Rev:</b> 1.0 (Official EPC Report)", STYLE_META))
    story.append(Spacer(1, 0.1 * cm))

    cell_hdr = lambda txt: Paragraph(f"<b><font size='9' color='#0f172a'>{txt}</font></b>", ParagraphStyle('c_hdr', parent=styles['Normal'], fontName='Helvetica-Bold'))
    cell_lbl = lambda txt: Paragraph(f"<b><font size='8.5' color='#1e293b'>{txt}</font></b>", ParagraphStyle('c_lbl', parent=styles['Normal'], fontName='Helvetica-Bold'))
    cell_obs = lambda txt: Paragraph(f"<font size='8.5' color='#475569'>{txt}</font>", ParagraphStyle('c_obs', parent=styles['Normal']))
    cell_val = lambda txt: Paragraph(f"<font size='8.5' color='#0f172a'>{txt}</font>", ParagraphStyle('c_val', parent=styles['Normal']))

    table_data = [
        [cell_hdr("Sr.No"), cell_hdr("Component"), cell_hdr("Observation"), cell_hdr("Value / Details")],
        [cell_obs("1"), cell_lbl("Name"), cell_obs("Observation"), cell_val(client_name)],
        [cell_obs("2"), cell_lbl("Consumer Number"), cell_obs("Observation"), cell_val(consumer_num)],
        [cell_obs("3"), cell_lbl("Site / Location Address"), cell_obs("Observation"), cell_val(site_addr)],
        [cell_obs("4"), cell_lbl("Category"), cell_obs("Govt / Private Sector"), cell_val(category)],
        [cell_obs("5"), cell_lbl("Sanction Number"), cell_obs("Observation"), cell_val(sanction_no)],
        [cell_obs("6"), cell_lbl("Sanctioned Capacity"), cell_obs("Solar PV System (KW)"), cell_val(f"{sol_kw} KW")],
        [cell_obs("7"), cell_lbl("Installed Capacity"), cell_obs("Solar PV System (KW)"), cell_val(f"{sol_kw} KW")],
        [cell_obs("8"), cell_lbl("Make & Type of Modules"), cell_obs("Specification of Modules"), cell_val(panel_make)],
        [cell_obs("9"), cell_lbl("ALMM Model Number"), cell_obs("Specification of Modules"), cell_val(almm_model)],
        [cell_obs("10"), cell_lbl("Wattage per Module"), cell_obs("Specification of Modules"), cell_val(f"{sol_wp} Wp")],
        [cell_obs("11"), cell_lbl("No. of Modules"), cell_obs("Specification of Modules"), cell_val(num_panels)],
        [cell_obs("12"), cell_lbl("Total Capacity (KWP)"), cell_obs("Specification of Modules"), cell_val(f"{sol_kw} KWP")],
        [cell_obs("13"), cell_lbl("Warranty Details"), cell_obs("Product + Performance"), cell_val("12+15 YEARS")],
        [cell_obs("14"), cell_lbl("Make & Model of Inverter"), cell_obs("PCU"), cell_val(inverter_make)],
        [cell_obs("15"), cell_lbl("Rating"), cell_obs("PCU"), cell_val(inverter_kw)],
        [cell_obs("16"), cell_lbl("Type of Charge Controller"), cell_obs("MPPT"), cell_val("MPPT")],
        [cell_obs("17"), cell_lbl("Capacity of Inverter"), cell_obs("PCU"), cell_val(inverter_kw)],
        [cell_obs("18"), cell_lbl("SR Number"), cell_obs("PCU"), cell_val(inverter_sr)],
        [cell_obs("19"), cell_lbl("Year of Manufacturing"), cell_obs("PCU"), cell_val("2025")],
        [cell_obs("20"), cell_lbl("Separate Earthings"), cell_obs("Earthing & Protection"), cell_val("3 Earthings (< 5 Ohms)")],
        [cell_obs("21"), cell_lbl("Certification"), cell_obs("Earthing & Protection"), cell_val("Certified as per IS 3043 / CEA Safety Guidelines")],
        [cell_obs("22"), cell_lbl("Lightning Arrester"), cell_obs("Earthing & Protection"), cell_val("Yes")],
    ]

    t1 = Table(table_data, colWidths=[1.2 * cm, 4.8 * cm, 4.4 * cm, 8.2 * cm])
    t1.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.8, colors.HexColor('#cbd5e1')),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(t1)
    story.append(Spacer(1, 0.25 * cm))
    story.append(_build_footer(1))
    story.append(PageBreak())

    # --- PAGE 2: DECLARATION & UNDERTAKING ---
    story.append(_build_header())
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph("<b>DECLARATION & STRUCTURAL STABILITY UNDERTAKING</b>", STYLE_TITLE))
    story.append(Paragraph(f"<b>Document No:</b> {doc_no} &nbsp;|&nbsp; <b>Date:</b> {date_str} &nbsp;|&nbsp; <b>Page 2 of 3</b>", STYLE_META))
    story.append(Spacer(1, 0.4 * cm))

    p1_text = (
        f"We <b>{company_name}</b> [<b>Vendor</b>] & <b>{client_name}</b> [<b>Consumer</b>] bearing Consumer Number "
        f"<b>{consumer_num}</b> ensured structural stability of installed <b>Solar PV System</b> and obtained "
        f"requisite permissions from the concerned authority. If in future, by virtue of any means due to "
        f"collapsing or damage to the installed solar power plant, <b>MSEDCL</b> will not be held responsible for "
        f"any loss to property or human life, if any."
    )
    story.append(Paragraph(p1_text, STYLE_BODY_JUSTIFY))

    p2_text = (
        "This is to certify above installed <b>Solar PV System</b> is working properly with electrical safety & "
        "<b>islanding switch</b>. In case of any presence of backup inverter, an arrangement should be made in such way "
        "the backup inverter supply should never be synchronized with solar inverter to avoid any electrical accident "
        "due to <b>back feeding</b>. We will be held responsible for non-working of islanding mechanism and back feed to the "
        "de-energized grid."
    )
    story.append(Paragraph(p2_text, STYLE_BODY_JUSTIFY))
    story.append(Spacer(1, 2.5 * cm))

    STYLE_VAL = ParagraphStyle('c_val', parent=styles['Normal'], fontSize=8.5, fontName='Helvetica', textColor=colors.HexColor('#0f172a'))

    # Balanced Signatures
    sign2 = Table([
        [
            Paragraph(f"<b>Authorized Signature [Vendor]</b><br/><br/><br/>______________________<br/>For <b>{company_name}</b>", STYLE_VAL),
            Paragraph(f"<b>Consumer Signature</b><br/><br/><br/>______________________<br/><b>{client_name}</b>", STYLE_VAL)
        ]
    ], colWidths=[9.3 * cm, 9.3 * cm])
    sign2.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(sign2)
    story.append(Spacer(1, 2.0 * cm))
    story.append(_build_footer(2))
    story.append(PageBreak())

    # --- PAGE 3: GUARANTEE CERTIFICATE UNDERTAKING ---
    story.append(_build_header())
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph("<b>GUARANTEE CERTIFICATE UNDERTAKING (VENDOR)</b>", STYLE_TITLE))
    story.append(Paragraph(f"<b>Document No:</b> {doc_no} &nbsp;|&nbsp; <b>Date:</b> {date_str} &nbsp;|&nbsp; <b>Page 3 of 3</b>", STYLE_META))
    story.append(Spacer(1, 0.4 * cm))

    body3_text = (
        "The undersigned will provide services to the consumers for repairs/maintenance of the RTS plant "
        "free of cost for <b>5 years</b> of the Comprehensive Maintenance Contract (<b>CMC</b>) period from the date of "
        "commissioning of the plant. Non-performing/under-performing system components will be replaced/repaired "
        "free of cost during the <b>CMC</b> period."
    )
    story.append(Paragraph(body3_text, STYLE_BODY_JUSTIFY))
    story.append(Spacer(1, 0.5 * cm))

    aadhaar_num = client.get('aadhaar') or client.get('aadhaar_number') or 'XXXX-XXXX-XXXX'

    # Centered Aadhaar Identity Box
    aadhaar_box_data = [
        [Paragraph("<b>[ CONSUMER AADHAAR CARD / IDENTITY VERIFICATION ]</b>", ParagraphStyle('a_hdr', parent=styles['Normal'], alignment=1, fontSize=9, fontName='Helvetica-Bold', textColor=colors.HexColor('#1e3a8a')))],
        [Paragraph(
            f"<b>Aadhaar Number:</b> {aadhaar_num}<br/>"
            f"<b>Consumer Name:</b> {client_name}<br/>"
            f"<b>Consumer Number:</b> {consumer_num}<br/>"
            f"<b>Installation Site:</b> {site_addr}",
            ParagraphStyle('a_body', parent=styles['Normal'], alignment=1, fontSize=8.5, leading=13, textColor=colors.HexColor('#1e293b'))
        )]
    ]
    aadhaar_table = Table(aadhaar_box_data, colWidths=[14 * cm])
    aadhaar_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#3b82f6')),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#eff6ff')),
        ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor('#f8fafc')),
        ('PADDING', (0, 0), (-1, -1), 10),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    story.append(aadhaar_table)
    story.append(Spacer(1, 2.0 * cm))

    sign3 = Table([
        [
            Paragraph(f"<b>Authorized Signature [Vendor]</b><br/><br/><br/>______________________<br/>For <b>{company_name}</b>", STYLE_VAL),
            Paragraph("<b>Vendor Stamp & Seal</b><br/><br/><br/>[ OFFICIAL SEAL ]", STYLE_VAL)
        ]
    ], colWidths=[9.3 * cm, 9.3 * cm])
    sign3.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(sign3)
    story.append(Spacer(1, 1.8 * cm))
    story.append(_build_footer(3))

    pdf.build(story)
    return buf.getvalue()


def _build_sldr_drawing(sol_kw="5", sol_wp="540", num_panels="10", panel_make="GVP SOLAR", inverter_make="GROWATT", inverter_kw="5"):
    d = Drawing(490, 305)
    d.add(Rect(0, 0, 490, 305, fillColor=colors.HexColor("#ffffff"), strokeColor=colors.HexColor("#334155"), strokeWidth=1))
    
    d.add(String(245, 290, "Grid Tied Solar Inverter System Electrical Single Line Diagram", fontName="Helvetica-Bold", fontSize=9.5, textAnchor="middle", fillColor=colors.HexColor("#1e293b")))

    # 1. PV Modules Array (Left)
    for col in range(2):
        for row in range(3):
            px = 25 + col * 35
            py = 175 - row * 35
            d.add(Rect(px, py, 30, 30, fillColor=colors.HexColor("#f8fafc"), strokeColor=colors.HexColor("#0284c7"), strokeWidth=1))
            d.add(Line(px+15, py, px+15, py+30, strokeColor=colors.HexColor("#e2e8f0"), strokeWidth=0.5))
            d.add(Line(px, py+15, px+30, py+15, strokeColor=colors.HexColor("#e2e8f0"), strokeWidth=0.5))
            d.add(Rect(px+10, py+22, 10, 6, fillColor=colors.HexColor("#bae6fd"), strokeColor=colors.HexColor("#0284c7"), strokeWidth=0.5))
            d.add(String(px+15, py+23, "J-Box", fontName="Helvetica", fontSize=4, textAnchor="middle", fillColor=colors.HexColor("#0369a1")))

    d.add(String(55, 95, f"PV Array: {num_panels} x {sol_wp}Wp", fontName="Helvetica-Bold", fontSize=7, textAnchor="middle", fillColor=colors.HexColor("#0f172a")))

    # Earthing Green
    d.add(Line(40, 105, 40, 45, strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.2))
    d.add(Line(30, 45, 50, 45, strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.2))
    d.add(Line(33, 41, 47, 41, strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.2))
    d.add(Line(36, 37, 44, 37, strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.2))
    d.add(String(40, 27, "Ground Earth", fontName="Helvetica", fontSize=7, textAnchor="middle", fillColor=colors.HexColor("#15803d")))

    # DC Cables Red
    d.add(Line(75, 105, 75, 70, strokeColor=colors.HexColor("#dc2626"), strokeWidth=1.5))
    d.add(Line(75, 70, 140, 70, strokeColor=colors.HexColor("#dc2626"), strokeWidth=1.5))
    d.add(String(105, 75, "DC 240V", fontName="Helvetica-Bold", fontSize=7, textAnchor="middle", fillColor=colors.HexColor("#b91c1c")))

    # 2. DC Isolator
    d.add(Rect(140, 50, 50, 40, fillColor=colors.HexColor("#fef2f2"), strokeColor=colors.HexColor("#ef4444"), strokeWidth=1))
    d.add(Line(150, 70, 180, 70, strokeColor=colors.HexColor("#dc2626"), strokeWidth=1.2))
    d.add(Circle(155, 70, 2.5, fillColor=colors.HexColor("#dc2626"), strokeColor=colors.HexColor("#dc2626")))
    d.add(Circle(175, 70, 2.5, fillColor=colors.HexColor("#dc2626"), strokeColor=colors.HexColor("#dc2626")))
    d.add(Line(155, 70, 172, 78, strokeColor=colors.HexColor("#dc2626"), strokeWidth=1.5))
    d.add(String(165, 38, "DC Isolator", fontName="Helvetica-Bold", fontSize=7.5, textAnchor="middle", fillColor=colors.HexColor("#991b1b")))
    d.add(String(165, 28, "B 31A", fontName="Helvetica", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#7f1d1d")))

    d.add(Line(190, 70, 220, 70, strokeColor=colors.HexColor("#dc2626"), strokeWidth=1.5))
    d.add(Line(220, 70, 220, 115, strokeColor=colors.HexColor("#dc2626"), strokeWidth=1.5))

    # 3. Grid Tied Solar Inverter Box
    d.add(Rect(200, 115, 120, 140, rx=8, ry=8, fillColor=colors.HexColor("#f8fafc"), strokeColor=colors.HexColor("#1e293b"), strokeWidth=1.5))
    d.add(String(260, 242, "Grid Tied Solar Inverter", fontName="Helvetica-Bold", fontSize=8, textAnchor="middle", fillColor=colors.HexColor("#0f172a")))
    
    # Wi-Fi Plug
    d.add(Rect(280, 255, 25, 15, rx=3, ry=3, fillColor=colors.HexColor("#e0f2fe"), strokeColor=colors.HexColor("#0284c7"), strokeWidth=1))
    d.add(String(292.5, 259, "Wi-Fi", fontName="Helvetica-Bold", fontSize=6, textAnchor="middle", fillColor=colors.HexColor("#0369a1")))
    d.add(String(292.5, 274, "((( Wi-Fi Monitor )))", fontName="Helvetica", fontSize=6, textAnchor="middle", fillColor=colors.HexColor("#0284c7")))

    # Converter Blocks
    d.add(Rect(215, 135, 40, 40, fillColor=colors.HexColor("#ffffff"), strokeColor=colors.HexColor("#475569"), strokeWidth=1))
    d.add(String(235, 151, "DC", fontName="Helvetica-Bold", fontSize=9, textAnchor="middle", fillColor=colors.HexColor("#334155")))
    
    d.add(Rect(215, 185, 40, 40, fillColor=colors.HexColor("#ffffff"), strokeColor=colors.HexColor("#475569"), strokeWidth=1))
    d.add(String(235, 201, "AC", fontName="Helvetica-Bold", fontSize=9, textAnchor="middle", fillColor=colors.HexColor("#334155")))

    d.add(Line(235, 175, 235, 185, strokeColor=colors.HexColor("#2563eb"), strokeWidth=1.5))
    d.add(String(215, 120, "DC In", fontName="Helvetica", fontSize=6.5, fillColor=colors.HexColor("#64748b")))
    d.add(String(290, 120, "AC Out", fontName="Helvetica", fontSize=6.5, fillColor=colors.HexColor("#64748b")))
    d.add(String(260, 102, f"Make: {inverter_make} ({inverter_kw})", fontName="Helvetica-Bold", fontSize=7.5, textAnchor="middle", fillColor=colors.HexColor("#1e293b")))

    d.add(Line(320, 140, 350, 140, strokeColor=colors.HexColor("#2563eb"), strokeWidth=1.5))
    d.add(String(335, 145, "AC 230V", fontName="Helvetica-Bold", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#1d4ed8")))

    # 4. AC Breaker
    d.add(Rect(350, 120, 40, 40, fillColor=colors.HexColor("#eff6ff"), strokeColor=colors.HexColor("#3b82f6"), strokeWidth=1))
    d.add(Line(360, 140, 380, 140, strokeColor=colors.HexColor("#1d4ed8"), strokeWidth=1.2))
    d.add(Circle(363, 140, 2, fillColor=colors.HexColor("#1d4ed8"), strokeColor=colors.HexColor("#1d4ed8")))
    d.add(Circle(377, 140, 2, fillColor=colors.HexColor("#1d4ed8"), strokeColor=colors.HexColor("#1d4ed8")))
    d.add(Line(363, 140, 375, 147, strokeColor=colors.HexColor("#1d4ed8"), strokeWidth=1.5))
    d.add(String(370, 108, "AC Breaker", fontName="Helvetica-Bold", fontSize=7.5, textAnchor="middle", fillColor=colors.HexColor("#1e40af")))

    d.add(Line(390, 140, 415, 140, strokeColor=colors.HexColor("#2563eb"), strokeWidth=1.5))

    # 5. Main Distribution Panel & Meter
    d.add(Rect(415, 80, 60, 185, rx=5, ry=5, fillColor=colors.HexColor("#f8fafc"), strokeColor=colors.HexColor("#0f172a"), strokeWidth=1.5))
    d.add(String(445, 252, "Main Panel", fontName="Helvetica-Bold", fontSize=7.5, textAnchor="middle", fillColor=colors.HexColor("#0f172a")))

    d.add(Rect(422, 195, 46, 45, fillColor=colors.HexColor("#ffffff"), strokeColor=colors.HexColor("#0284c7"), strokeWidth=1))
    d.add(String(445, 222, "Meter", fontName="Helvetica-Bold", fontSize=9, textAnchor="middle", fillColor=colors.HexColor("#0369a1")))
    d.add(String(445, 204, "[ P14 ]", fontName="Helvetica", fontSize=7, textAnchor="middle", fillColor=colors.HexColor("#0284c7")))

    d.add(Rect(422, 125, 46, 30, fillColor=colors.HexColor("#ffffff"), strokeColor=colors.HexColor("#475569"), strokeWidth=1))
    d.add(String(445, 137, "Main Switch", fontName="Helvetica-Bold", fontSize=7, textAnchor="middle", fillColor=colors.HexColor("#334155")))

    d.add(Line(468, 217, 485, 217, strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.5))
    d.add(PolyLine([481, 221, 487, 217, 481, 213], strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.5, fillColor=colors.HexColor("#16a34a")))
    d.add(String(450, 272, "To Utility Grid (N / L)", fontName="Helvetica-Bold", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#15803d")))

    d.add(Line(468, 140, 485, 140, strokeColor=colors.HexColor("#d97706"), strokeWidth=1.5))
    d.add(PolyLine([481, 144, 487, 140, 481, 136], strokeColor=colors.HexColor("#d97706"), strokeWidth=1.5, fillColor=colors.HexColor("#d97706")))
    d.add(String(450, 95, "To Local Load (N / L)", fontName="Helvetica-Bold", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#b45309")))

    d.add(Line(445, 80, 445, 45, strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.2))
    d.add(Line(435, 45, 455, 45, strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.2))
    d.add(Line(438, 41, 452, 41, strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.2))
    d.add(Line(441, 37, 449, 37, strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.2))
    d.add(String(445, 27, "Ground Earth", fontName="Helvetica", fontSize=7, textAnchor="middle", fillColor=colors.HexColor("#15803d")))

    return d


def generate_sldr_pdf(client: dict, company: dict) -> bytes:
    buf = BytesIO()

    def _draw_sldr_frame(canvas, doc):
        canvas.saveState()
        canvas.setLineWidth(1.5)
        canvas.setStrokeColor(colors.HexColor("#0f172a"))
        canvas.rect(0.8 * cm, 0.8 * cm, 19.4 * cm, 27.9 * cm)
        canvas.setLineWidth(0.6)
        canvas.rect(0.95 * cm, 0.95 * cm, 19.1 * cm, 27.6 * cm)
        canvas.restoreState()

    pdf = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.2 * cm,
        rightMargin=1.2 * cm,
        topMargin=1.1 * cm,
        bottomMargin=1.1 * cm
    )
    story = []

    client_name = (client.get('full_name') or client.get('name') or 'CONSUMER NAME').upper()
    consumer_num = client.get('consumer_number') or '—'
    bu_num = client.get('bu_number') or client.get('billing_unit') or '4710'
    sol_kw = str(client.get('system_kw') or '5')
    sol_wp = str(client.get('panel_wattage') or '540')
    num_panels = str(client.get('num_panels') or '10')
    panel_make = (client.get('panel_make') or 'GVP SOLAR').upper()
    inverter_make = (client.get('inverter_make') or 'GROWATT').upper()
    inverter_kw = str(client.get('inverter_capacity') or f"{sol_kw} KW").upper()

    company_name = (company.get('company_name') or 'GVP SOLAR ENERGY').upper()

    STYLE_SLDR_TITLE = ParagraphStyle('sldr_t', parent=styles['Normal'], fontSize=15, fontName='Helvetica-Bold', alignment=1, spaceAfter=8, textColor=colors.HexColor('#0f172a'))
    STYLE_SLDR_META = ParagraphStyle('sldr_m', parent=styles['Normal'], fontSize=10, fontName='Helvetica-Bold', leading=15, textColor=colors.HexColor('#0f172a'))
    STYLE_TBL_HDR = ParagraphStyle('sldr_th', parent=styles['Normal'], fontSize=9, fontName='Helvetica-Bold', alignment=1, textColor=colors.HexColor('#0f172a'))
    STYLE_TBL_CELL = ParagraphStyle('sldr_tc', parent=styles['Normal'], fontSize=8.5, fontName='Helvetica-Bold', alignment=1, textColor=colors.HexColor('#1e293b'))
    STYLE_FTR = ParagraphStyle('sldr_ftr', parent=styles['Normal'], fontSize=8.5, fontName='Helvetica-Bold', textColor=colors.HexColor('#0f172a'))

    story.append(Paragraph("<u><b>SINGLE LINE DIAGRAM</b></u>", STYLE_SLDR_TITLE))
    story.append(Spacer(1, 0.15 * cm))

    meta_text = (
        f"<b>CONSUMER NAME :-</b> {client_name}<br/>"
        f"<b>CONSUMER NO.:-</b>{consumer_num} <b>B.U.:-</b>{bu_num}<br/>"
        f"<b>PROJECT:-</b> GCRT OF {sol_kw} KW"
    )
    story.append(Paragraph(meta_text, STYLE_SLDR_META))
    story.append(Spacer(1, 0.2 * cm))

    story.append(_build_sldr_drawing(sol_kw, sol_wp, num_panels, panel_make, inverter_make, inverter_kw))
    story.append(Spacer(1, 0.25 * cm))

    story.append(Paragraph("<b>TECHNICAL SPECIFICATIONS</b>", ParagraphStyle('tech_title', parent=styles['Normal'], fontSize=9.5, fontName='Helvetica-Bold', spaceAfter=4, textColor=colors.HexColor('#0f172a'))))

    tech_table_data = [
        [Paragraph("<b>PARAMETER</b>", STYLE_TBL_HDR), Paragraph("<b>SPECIFICATIONS</b>", STYLE_TBL_HDR), Paragraph("<b>MAKE</b>", STYLE_TBL_HDR), Paragraph("<b>KWP</b>", STYLE_TBL_HDR)],
        [Paragraph("PV MODULES", STYLE_TBL_CELL), Paragraph(f"{sol_wp} Wp X {num_panels} Nos", STYLE_TBL_CELL), Paragraph(panel_make, STYLE_TBL_CELL), Paragraph(f"{sol_kw} KW", STYLE_TBL_CELL)],
        [Paragraph("INVERTER", STYLE_TBL_CELL), Paragraph(f"{inverter_kw} X 1 NOS", STYLE_TBL_CELL), Paragraph(inverter_make, STYLE_TBL_CELL), Paragraph(f"{inverter_kw}", STYLE_TBL_CELL)],
    ]
    t_tech = Table(tech_table_data, colWidths=[4.5 * cm, 5.5 * cm, 4.6 * cm, 4.0 * cm])
    t_tech.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.8, colors.HexColor('#000000')),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f8fafc')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_tech)
    story.append(Spacer(1, 0.4 * cm))

    footer_table = Table([
        [
            Paragraph(f"<b>{company_name}</b><br/><br/><br/>Proprietor / Manager", STYLE_FTR),
            Paragraph("___________________________<br/><br/><b>Consumer / Authorized Signature</b>", ParagraphStyle('sig_r', parent=STYLE_FTR, alignment=2))
        ]
    ], colWidths=[9.3 * cm, 9.3 * cm])
    footer_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(footer_table)

    pdf.build(story, onFirstPage=_draw_sldr_frame)
    return buf.getvalue()


class NetMeterCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        # Footer line
        self.setStrokeColor(colors.HexColor('#cbd5e1'))
        self.setLineWidth(0.5)
        self.line(1.5 * cm, 1.2 * cm, 21.0 * cm - 1.5 * cm, 1.2 * cm)
        
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor('#475569'))
        self.drawString(1.5 * cm, 0.8 * cm, "GVP SOLAR ENERGY")
        self.drawCentredString(10.5 * cm, 0.8 * cm, "Net Metering Connection Agreement")
        self.drawRightString(21.0 * cm - 1.5 * cm, 0.8 * cm, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()


def generate_net_meter_agreement_pdf(client: dict, company: dict) -> bytes:
    # 1. Validation check
    missing_fields = []
    if not client.get("full_name"):
        missing_fields.append("Client Name")
    if not client.get("consumer_number"):
        missing_fields.append("Consumer Number")
    if not client.get("system_kw") and not client.get("capacity"):
        missing_fields.append("Solar System Capacity (kW)")
    
    if missing_fields:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail=f"Missing required client data for Net Meter Agreement: {', '.join(missing_fields)}. Please update client details before generating."
        )

    buf = BytesIO()
    pdf = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.8 * cm
    )
    story = []

    # Dynamic Data Extraction
    client_name = (client.get("full_name") or client.get("name") or "CLIENT").strip()
    consumer_no = str(client.get("consumer_number") or "—").strip()
    client_addr = (client.get("address") or "—").strip()
    city = (client.get("city") or "ICHALKARANJI").strip()
    pincode = str(client.get("pincode") or "").strip()
    full_address = f"{client_addr}, {city} {pincode}".strip(", ")
    
    system_kw = str(client.get("system_kw") or client.get("capacity") or "8").strip()
    
    date_str = client.get("installation_date") or client.get("created_at") or datetime.now().strftime("%d/%m/%Y")
    if len(date_str) > 10:
        date_str = date_str[:10]
        
    company_name = company.get("company_name") or "GVP SOLAR ENERGY"
    bu_no = client.get("bu_number") or "BU-4711"
    sub_div = client.get("sub_division") or "ICHALKARANJI B S/DN."
    division = client.get("division") or "Dist KOLHAPUR"

    # Define Styles
    style_h1 = ParagraphStyle('NMA_H1', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=14, leading=18, alignment=1, spaceAfter=6)
    style_h2 = ParagraphStyle('NMA_H2', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=12, leading=16, alignment=1, spaceAfter=12)
    style_clause_h = ParagraphStyle('NMA_ClauseH', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10, leading=14, spaceBefore=8, spaceAfter=4)
    style_body = ParagraphStyle('NMA_Body', parent=styles['Normal'], fontName='Helvetica', fontSize=9.5, leading=14, alignment=4, spaceAfter=6)
    style_body_bold = ParagraphStyle('NMA_BodyBold', parent=style_body, fontName='Helvetica-Bold')

    # ==================== PAGE 1 ====================
    # Non-Judicial Government Stamp Header Box
    stamp_header = Table([
        [Paragraph("<b>भारतीय गैर न्यायिक</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <b>भारत INDIA</b>", ParagraphStyle('stmp1', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=11, alignment=1, textColor=colors.HexColor('#991b1b')))],
        [Paragraph("<b>रु. 500 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; FIVE HUNDRED RUPEES &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Rs. 500</b>", ParagraphStyle('stmp2', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=12, alignment=1, textColor=colors.HexColor('#1e3a8a')))],
        [Paragraph("<b>सत्यमेव जयते</b>", ParagraphStyle('stmp3', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, alignment=1))],
        [Paragraph("<b>INDIA NON JUDICIAL</b>", ParagraphStyle('stmp4', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=13, alignment=1, textColor=colors.HexColor('#991b1b')))],
        [Paragraph("<b>महाराष्ट्र MAHARASHTRA</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <b>2025</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <b>ED 513116</b>", ParagraphStyle('stmp5', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10, alignment=1, textColor=colors.HexColor('#1e293b')))]
    ], colWidths=[18.0 * cm])
    stamp_header.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1.5, colors.HexColor('#1e3a8a')),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(stamp_header)
    story.append(Spacer(1, 1.0 * cm))

    # Treasury Stamp Table / Stamp Vendor Details Box
    treasury_data = [
        [Paragraph("<b>मुद्रांक विक्री नोंद अ क्र</b>", style_body), Paragraph(f"<b>१४७०</b> &nbsp; <b>दि.:</b> <b>{date_str}</b>", style_body), Paragraph("<b>मुद्रांक शुल्क रक्कम:</b> <b>रु. ५००/-</b>", style_body)],
        [Paragraph("<b>मुद्रांक विकत घेणाऱ्याचे नाव:</b>", style_body), Paragraph(f"<b>{client_name}</b>", style_body_bold), Paragraph("<b>इचलकरंजी</b>", style_body)],
        [Paragraph("<b>मुद्रांक परवानाधारक:</b>", style_body), Paragraph("श्री विश्वनाथ कृष्णा घाटगे (पत्ता: १०/५६३,इचलकरंजी) कोड नंबर: २७०७०५२", style_body), Paragraph("<b>Treasury Office:</b> Ichalkaranji", style_body)],
        [Paragraph("<b>परवानाधारक सही / स्वाक्षरी:</b>", style_body), Paragraph("कोमल बिजमोहन माहेश्वरी", style_body), Paragraph("<b>Sub Treasury Officer</b>", style_body)]
    ]
    t_treasury = Table(treasury_data, colWidths=[5.5 * cm, 7.5 * cm, 5.0 * cm])
    t_treasury.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#475569')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#94a3b8')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(t_treasury)
    story.append(PageBreak())

    # ==================== PAGE 2 ====================
    story.append(Paragraph("<b>ANNEXURE – 3</b>", style_h1))
    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph("<b>Net Metering Connection Agreement</b>", style_h2))
    story.append(Spacer(1, 0.4 * cm))

    preamble_p1 = (
        f"This Agreement is made and entered into at (location) <b>ICHALKARANJI</b> on this "
        f"<b>(date {date_str})</b> between the Eligible Consumer <b>{client_name}</b> "
        f"having premises at <b>{full_address}</b> and Consumer No <b>{consumer_no}</b> "
        f"as the first Party<br/>"
        f"AND<br/>"
        f"The Distribution Licensee <b>Additional Executive Engineer, {sub_div}/ {bu_no}, MSEDCL</b>, "
        f"(hereinafter referred to as 'the Licensee') and having its Registered Office at <b>{division}</b> as second Party of this Agreement;"
    )
    story.append(Paragraph(preamble_p1, style_body))
    story.append(Spacer(1, 0.3 * cm))

    preamble_p2 = (
        "Whereas, the Eligible Consumer has applied to the Licensee for approval of a Net Metering Arrangement "
        "under the provisions of the Maharashtra Electricity Regulatory Commission (Net Metering for Roof-top Solar Photo Voltaic Systems) Regulations, 2019 "
        "('the Net Metering Regulations') and sought its connectivity to the Licensee's Distribution Network;"
    )
    story.append(Paragraph(preamble_p2, style_body))
    story.append(Spacer(1, 0.3 * cm))

    preamble_p3 = (
        f"And whereas, the Licensee has agreed to provide Network connectivity to the Eligible Consumer for injection "
        f"of electricity generated from its Roof-top Solar PV System of <b>{system_kw} kilowatt</b>;"
    )
    story.append(Paragraph(preamble_p3, style_body))
    story.append(Spacer(1, 0.3 * cm))

    story.append(Paragraph("<b>Both Parties hereby agree as follows</b>", style_body_bold))
    story.append(PageBreak())

    # ==================== PAGE 3 ====================
    story.append(Paragraph("<b>1. Eligibility:</b>", style_clause_h))
    story.append(Paragraph(
        "The Roof-top Solar PV System meets the applicable norms for being integrated into the Distribution Network, "
        "and that the Eligible Consumer shall maintain the System accordingly for the duration of this Agreement.",
        style_body
    ))

    story.append(Paragraph("<b>2. Technical and Inter-connection Requirements:</b>", style_clause_h))
    story.append(Paragraph(
        "2.1. The metering arrangement and the inter-connection of the Roof-top Solar PV System with the Network of the Licensee "
        "shall be as per the provisions of the Net Metering Regulations and the technical standards and norms specified by the "
        "Central Electricity Authority for connectivity of distributed generation resources and for the installation and operation of meters.",
        style_body
    ))
    story.append(Paragraph(
        "2.2. The Eligible Consumer agrees, that he shall install, prior to connection of the Roof-top Solar PV System to the Network of the Licensee, "
        "an isolation device (both automatic and in built within inverter and external manual relays); and the Licensee shall have access to it "
        "if required for the repair and maintenance of the Distribution Network.",
        style_body
    ))
    story.append(Paragraph(
        "2.3. The Licensee shall specify the interface/inter-connection point and metering point.",
        style_body
    ))
    story.append(Paragraph(
        "2.4. The Eligible Consumer shall specify relevant data, such as voltage, frequency, circuit breaker, isolator position in his System, "
        "as and when required by the Licensee.",
        style_body
    ))

    story.append(Paragraph("<b>3. Safety:</b>", style_clause_h))
    story.append(Paragraph(
        "3.1 The equipment connected to the Licensee's Distribution System shall be compliant with relevant International (IEEE/IEC) "
        "or Indian Standards (BIS), as the case may be, and the installation of electrical equipment shall comply with the requirements "
        "specified by the Electricity Authority regarding safety and electricity supply.",
        style_body
    ))
    story.append(Paragraph(
        "3.2 The design, installation, maintenance and operation of the Roof-top Solar PV System shall be undertaken in a manner "
        "conducive to the safety of the Roof-top Solar PV System as well as the Licensee's Network.",
        style_body
    ))
    story.append(Paragraph(
        "3.3 If, at any time, the Licensee determines that the Eligible Consumer's Roof-top Solar PV System is causing or may cause damage "
        "to and/or results in the Licensee's other consumers or its assets, the Eligible Consumer shall disconnect the Roof-top Solar PV System "
        "from the distribution Network upon direction from the Licensee, and shall undertake corrective measures at his own expense prior to re-connection.",
        style_body
    ))
    story.append(Paragraph(
        "3.4 The Licensee shall not be responsible for any accident resulting in injury to human beings or animals or damage to property "
        "that may occur due to back- feeding from the Roof-top Solar PV System when the grid supply is off. The Licensee may disconnect "
        "the installation at any time in the event of such exigencies to prevent such accident.",
        style_body
    ))

    story.append(Paragraph("<b>Other Clearances and Approvals:</b>", style_clause_h))
    story.append(Paragraph(
        "The Eligible Consumer shall obtain any statutory approvals and clearances that may be required, such as from the Electrical Inspector "
        "or the municipal or other authorities, before connecting the Roof-top Solar PV System to the distribution Network.",
        style_body
    ))

    story.append(Paragraph("<b>4. Period of Agreement, and Termination:</b>", style_clause_h))
    story.append(PageBreak())

    # ==================== PAGE 4 ====================
    story.append(Paragraph("This Agreement shall be for a period of 20 years, but may be terminated prematurely", style_body))
    story.append(Paragraph("(a) By mutual consent; or", style_body))
    story.append(Paragraph("(b) By the Eligible Consumer, by giving 30 days' notice to the Licensee ;", style_body))
    story.append(Paragraph(
        "(c) By the Licensee, by giving 30 days' notice, if the Eligible Consumer breaches any terms of this Agreement or the provisions "
        "of the Net Metering Regulations and does not remedy such breach within 30 days, or such other reasonable period as may be provided, "
        "of receiving notice of such breach, or for any other valid reason communicated by the Licensee in writing.",
        style_body
    ))

    story.append(Paragraph("<b>6. Access and Disconnection:</b>", style_clause_h))
    story.append(Paragraph(
        "6.1. The Eligible Consumer shall provide access to the Licensee to the metering equipment and disconnecting devices "
        "of Roof-top Solar PV System, both automatic and manual, by the Eligible Consumer.",
        style_body
    ))
    story.append(Paragraph(
        "6.2. If, in an emergent or outage situation, the Licensee cannot access the disconnecting devices of the Roof-top Solar PV System, "
        "both automatic and manual, it may disconnect power supply to the premises.",
        style_body
    ))
    story.append(Paragraph(
        "6.3 Upon termination of this Agreement under Clause 5, the Eligible Consumer shall disconnect the Roof-top Solar PV System "
        "forthwith from the Network of the Licensee.",
        style_body
    ))

    story.append(Paragraph("<b>7. Liabilities:</b>", style_clause_h))
    story.append(Paragraph(
        "7.1. The Parties shall indemnify each other for damages or adverse effects of either Party's negligence or misconduct "
        "during the installation of the Roof-top Solar PV System, connectivity with the distribution Network and operation of the System.",
        style_body
    ))
    story.append(Paragraph(
        "7.2. The Parties shall not be liable to each other for any loss of profits or revenues, business interruption losses, "
        "loss of contract or goodwill, or for indirect, consequential, incidental or special damages including, but not limited to, "
        "punitive or exemplary damages, whether any of these liabilities, losses or damages arise in contract, or otherwise.",
        style_body
    ))

    story.append(Paragraph("<b>8. Commercial Settlement:</b>", style_clause_h))
    story.append(Paragraph(
        "8.1. The commercial settlements under this Agreement shall be in accordance with the Net Metering Regulations.",
        style_body
    ))
    story.append(Paragraph(
        "8.2. The Licensee shall not be liable to compensate the Eligible Consumer if his Rooftop Solar PV System is unable to inject surplus power "
        "generated into the Licensee's Network on account of failure of power supply in the grid/Network.",
        style_body
    ))
    story.append(Paragraph(
        "8.3. The existing metering System, if not in accordance with the Net Metering Regulations, shall be replaced by a bi-directional meter "
        "(whole current/CT operated) or a pair of meters (as per the definition of 'Net Meter' in the Regulations), and a separate generation meter "
        "may be provided to measure Solar power generation. The bi-directional meter (whole current/CT operated) or pair of meters shall be installed "
        "at the inter-connection point to the Licensee's Network for recording export and import of energy.",
        style_body
    ))
    story.append(PageBreak())

    # ==================== PAGE 5 ====================
    story.append(Paragraph(
        "8.4. The uni-directional and bi-directional or pair of meters shall be fixed in separate meter boxes in the same proximity.",
        style_body
    ))
    story.append(Paragraph(
        "8.5. The Licensee shall issue monthly electricity bill for the net metered energy on the scheduled date of meter reading. "
        "If the exported energy exceeds the imported energy, the Licensee shall show the net energy exported as credited Units of electricity "
        "as specified in the Net Metering Regulations, 2015. If the exported energy is less than the imported energy, the Eligible Consumer "
        "shall pay the Distribution Licensee for the net energy imported at the prevailing tariff approved by the Commission for the consumer "
        "category to which he belongs.",
        style_body
    ))

    story.append(Paragraph("<b>9. Connection Costs:</b>", style_clause_h))
    story.append(Paragraph(
        "The Eligible Consumer shall bear all costs related to the setting up of the Roof-top Solar PV System, excluding the Net Metering Arrangement costs.",
        style_body
    ))

    story.append(Paragraph("<b>10. Dispute Resolution:</b>", style_clause_h))
    story.append(Paragraph(
        "10.1 Any dispute arising under this Agreement shall be resolved promptly, in good faith and in an equitable manner by both the Parties.",
        style_body
    ))
    story.append(Paragraph(
        "10.2 The Eligible Consumer shall have recourse to the concerned Consumer Grievance Redressal Forum constituted under the relevant Regulations "
        "in respect of any grievance regarding billing which has not been redressed by the Licensee.",
        style_body
    ))
    story.append(Spacer(1, 0.4 * cm))

    witness_intro = (
        f"In the witness where of <b>{client_name}</b> for and on behalf of Eligible Consumer and Shri. "
        f"Additional Executive Engineer <b>{sub_div}/ MSEDCL</b>, for and on behalf of MSEDCL agree to this agreement."
    )
    story.append(Paragraph(witness_intro, style_body))
    story.append(Spacer(1, 0.6 * cm))

    # Signature Table
    sig_table_data = [
        [
            Paragraph(f"<br/><br/>___________________________<br/><b>{client_name}</b><br/>for and on behalf of Eligible Consumer", style_body),
            Paragraph(f"<br/><br/>Shri. ___________________________<br/>for and on behalf of MSEDCL", style_body)
        ],
        [
            Paragraph("<br/><b>Witness 1:</b> ___________________________", style_body),
            Paragraph("<br/><b>Witness 1:</b> ___________________________", style_body)
        ],
        [
            Paragraph("<br/><b>Witness 2:</b> ___________________________", style_body),
            Paragraph("<br/><b>Witness 2:</b> ___________________________", style_body)
        ],
        [
            Paragraph(f"<br/><br/><b>{company_name}</b><br/>Proprietor / Authorized Manager", style_body),
            Paragraph("<br/><br/>Official Stamp / Seal", style_body)
        ]
    ]
    t_sig = Table(sig_table_data, colWidths=[9.0 * cm, 9.0 * cm])
    t_sig.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_sig)

    pdf.build(story, canvasmaker=NetMeterCanvas)
    return buf.getvalue()


def generate(doc_type: str, client: dict, company: dict) -> bytes:
    doc_type_clean = (doc_type or "").lower().strip()
    if doc_type_clean == "wcr":
        return generate_wcr_pdf(client, company)
    if doc_type_clean == "sldr":
        return generate_sldr_pdf(client, company)
    if doc_type_clean == "net_meter_agreement":
        return generate_net_meter_agreement_pdf(client, company)

    buf = BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.5*cm, rightMargin=1.5*cm, topMargin=1.5*cm, bottomMargin=1.5*cm)
    story: list = _header(company)

    title_map = {
        "annexure": "ANNEXURE — Material & Site Details",
        "wcr": "WORK COMPLETION REPORT (WCR)",
        "sldr": "SINGLE LINE DIAGRAM REPORT (SLDR)",
        "net_meter_agreement": "NET METER AGREEMENT",
        "vendor_agreement": "VENDOR AGREEMENT",
        "quotation": "SOLAR PV SYSTEM QUOTATION",
        "installation_report": "INSTALLATION & COMMISSIONING REPORT",
        "completion_report": "FINAL SYSTEM COMPLETION REPORT",
    }
    story.append(Paragraph(title_map.get(doc_type_clean, doc_type_clean.upper()), H2))
    story.append(Paragraph(f"Document No.: <b>{client.get('sol_id','SOL-')}-{doc_type_clean.upper()}</b> &nbsp;&nbsp; Date: <b>{datetime.now(timezone.utc).strftime('%d %b %Y')}</b>", SMALL))
    story.append(Spacer(1, 0.4 * cm))

    story.append(Paragraph("Client Details", H2))
    story.append(_kv_table([
        ["Client Name", client.get("full_name", "")],
        ["Mobile", client.get("mobile", "")],
        ["Consumer Number", client.get("consumer_number", "—")],
        ["Address", f"{client.get('address','')}, {client.get('city','')}, {client.get('state','')} - {client.get('pincode','')}"],
        ["Aadhaar (last 4)", (client.get("aadhaar","") or "")[-4:] or "—"],
    ]))
    story.append(Spacer(1, 0.4 * cm))

    story.append(Paragraph("System Specifications", H2))
    story.append(_kv_table([
        ["System Size", f"{client.get('system_kw',0)} kW"],
        ["Phase Type", client.get("phase_type", "")],
        ["Subsidy Eligible", "Yes" if client.get("subsidy_eligible") else "No"],
        ["Panel", f"{client.get('panel_make','')} · {client.get('panel_wattage','')}W × {client.get('num_panels','')}"],
        ["Inverter", f"{client.get('inverter_make','')} · {client.get('inverter_capacity','')}"],
        ["Inverter Serial", client.get("inverter_serial", "—")],
    ]))
    story.append(Spacer(1, 0.5 * cm))

    if doc_type_clean == "annexure":
        story.append(Paragraph("Material Annexure", H2))
        story.append(Paragraph(
            "This annexure certifies that the following materials have been used in the installation as per the agreed BOM. "
            "Quantities and serial numbers reflect the field verification report.", BODY,
        ))
    elif doc_type_clean == "sldr":
        story.append(Paragraph("Single Line Diagram Summary", H2))
        story.append(Paragraph(
            "DC side: Solar panels → DCDB (with surge arrester & DC isolator) → Inverter MPPT input. "
            "AC side: Inverter AC output → ACDB (with MCB + RCBO) → Net Meter → DISCOM grid. "
            "Earthing: Separate earth pits for AC, DC and lightning arrester as per IS 3043.",
            BODY,
        ))
    elif doc_type_clean in ("net_meter_agreement", "vendor_agreement"):
        story.append(Paragraph("Agreement Terms & Undertaking", H2))
        story.append(Paragraph(
            "1. The consumer agrees to install a bi-directional net meter at their premises.<br/>"
            "2. Excess generation will be credited as per the prevailing DISCOM tariff.<br/>"
            "3. Annual settlement will be carried out by the DISCOM as per state regulations.<br/>"
            "4. The vendor agrees to provide 5-year Comprehensive Maintenance Contract (CMC) coverage.",
            BODY,
        ))

    story.append(Spacer(1, 1.2 * cm))
    sign = Table([
        [Paragraph("<b>Customer Signature</b><br/><br/><br/>_____________________<br/>" + client.get("full_name", ""), SMALL),
         Paragraph("<b>Authorized Signatory</b><br/><br/><br/>_____________________<br/>" + company.get("company_name", "") + "<br/>" + company.get("owner_name", ""), SMALL)],
    ], colWidths=[9*cm, 9*cm])
    sign.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(sign)

    pdf.build(story)
    return buf.getvalue()


def generate_ledger_pdf(client: dict, ledger: dict, company: dict) -> bytes:
    buf = BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1.5 * cm, bottomMargin=1.5 * cm)
    story: list = _header(company)
    
    story.append(Paragraph("<b>CLIENT MATERIAL LEDGER REPORT</b>", H1))
    story.append(Spacer(1, 0.2 * cm))
    
    details = [
        ["Client Name", client.get("full_name", "")],
        ["Project ID", client.get("sol_id") or client.get("client_code") or ""],
        ["Generated Date", datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
    ]
    story.append(_table(details, col_widths=[5 * cm, 13 * cm]))
    story.append(Spacer(1, 0.4 * cm))
    
    story.append(Paragraph("Ledger Summary", H2))
    summary = ledger.get("summary") or {}
    summary_data = [
        ["Total Products", str(summary.get("total_products", 0))],
        ["Total Outward Qty", str(summary.get("total_outward_qty", 0))],
        ["Total Returned Qty", str(summary.get("total_returned_qty", 0))],
        ["Current Balance", str(summary.get("current_balance", 0))],
        ["Negative Items", str(summary.get("negative_items", 0))]
    ]
    story.append(_table(summary_data, col_widths=[9 * cm, 9 * cm]))
    story.append(Spacer(1, 0.4 * cm))
    
    story.append(Paragraph("Material Details", H2))
    
    style_normal = ParagraphStyle('normal_cell', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#000000'))
    style_red = ParagraphStyle('red_cell', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#dc2626'))
    style_gray = ParagraphStyle('gray_cell', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor('#94a3b8'))
    
    headers = [
        Paragraph('<font color="#ffffff"><b>Product</b></font>', HEADER_TEXT_STYLE),
        Paragraph('<font color="#ffffff"><b>Size</b></font>', HEADER_TEXT_STYLE),
        Paragraph('<font color="#ffffff"><b>Unit</b></font>', HEADER_TEXT_STYLE),
        Paragraph('<font color="#ffffff"><b>Outward</b></font>', HEADER_TEXT_STYLE),
        Paragraph('<font color="#ffffff"><b>Returned</b></font>', HEADER_TEXT_STYLE),
        Paragraph('<font color="#ffffff"><b>Balance</b></font>', HEADER_TEXT_STYLE),
        Paragraph('<font color="#ffffff"><b>Status</b></font>', HEADER_TEXT_STYLE),
    ]
    rows: list = [headers]
    
    for item in ledger.get("items") or []:
        bal = float(item.get("current_balance") or 0)
        cstyle = style_normal
        if bal < 0:
            cstyle = style_red
        elif bal == 0:
            cstyle = style_gray
            
        rows.append([
            Paragraph(str(item.get("product", "")), cstyle),
            Paragraph(str(item.get("size", "") or ""), cstyle),
            Paragraph(str(item.get("unit", "") or "Nos"), cstyle),
            Paragraph(str(item.get("total_outward", 0)), cstyle),
            Paragraph(str(item.get("total_returned", 0)), cstyle),
            Paragraph(str(item.get("current_balance", 0)), cstyle),
            Paragraph(str(item.get("status", "")), cstyle),
        ])
        
    story.append(_table(rows, col_widths=[5.5 * cm, 2.5 * cm, 1.5 * cm, 2 * cm, 2 * cm, 2 * cm, 2.5 * cm], header_row=True))
    
    pdf.build(story)
    return buf.getvalue()
