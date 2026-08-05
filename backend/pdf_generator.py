from __future__ import annotations
"""PDF generators for Solarix documents."""
from io import BytesIO
from datetime import datetime, timezone
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, Image as RLImage
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



class WCRCanvas(canvas.Canvas):
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
        # Bottom Divider line
        self.setStrokeColor(colors.HexColor('#9333ea'))
        self.setLineWidth(1.2)
        self.line(1.2 * cm, 1.4 * cm, 21.0 * cm - 1.2 * cm, 1.4 * cm)
        
        self.setFont("Helvetica-Bold", 7.5)
        self.setFillColor(colors.HexColor('#2563eb'))
        
        line1 = "OFFICE :- SHOP NO – 1-2, FIRST FLOOR, BUILDING NO – 1, KAPAD TEXTILE MARKET ICHALKARANJI (MAH.) - 416115"
        line2 = "PHONE : +91-9694060806 GIRIRAJ"
        
        self.drawString(1.2 * cm, 1.0 * cm, line1)
        self.drawString(1.2 * cm, 0.65 * cm, line2)
        
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor('#475569'))
        self.drawRightString(21.0 * cm - 1.2 * cm, 0.65 * cm, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()


def generate_wcr_pdf(client: dict, company: dict) -> bytes:
    # 1. Validation Check
    missing_fields = []
    if not (client.get("full_name") or client.get("name")):
        missing_fields.append("Consumer Name")
    if not client.get("consumer_number"):
        missing_fields.append("Consumer Number")
    if not (client.get("system_kw") or client.get("capacity")):
        missing_fields.append("Solar System Capacity")
    if not company.get("company_name"):
        missing_fields.append("Company Name")
    if not (company.get("gst_number") or company.get("gst")):
        missing_fields.append("Company GST Number")
        
    if missing_fields:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail=f"Missing required data for WCR: {', '.join(missing_fields)}. Please update client/company details before generating."
        )

    buf = BytesIO()
    pdf = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.2 * cm,
        rightMargin=1.2 * cm,
        topMargin=1.0 * cm,
        bottomMargin=1.8 * cm
    )
    story = []

    company_name = company.get('company_name') or 'GVP SOLAR ENERGY'
    gst_no = company.get('gst_number') or company.get('gst') or '27AKMPD5407A1ZM'

    # Styles
    STYLE_TITLE = ParagraphStyle('wcr_title', parent=styles['Normal'], fontSize=13, fontName='Helvetica-Bold', textColor=colors.HexColor('#0f172a'), alignment=1, spaceBefore=4, spaceAfter=8)
    STYLE_BODY_JUSTIFY = ParagraphStyle('wcr_body_j', parent=styles['Normal'], fontSize=9.5, fontName='Helvetica', textColor=colors.HexColor('#1e293b'), leading=14, alignment=4, spaceAfter=8)
    STYLE_VAL = ParagraphStyle('c_val', parent=styles['Normal'], fontSize=8.5, fontName='Helvetica', textColor=colors.HexColor('#0f172a'))

    # Header Builder
    def _build_header():
        logo_bytes = company.get("logo_bytes")
        logo_d = None
        if logo_bytes:
            try:
                from PIL import Image as PILImage
                img = PILImage.open(BytesIO(logo_bytes))
                img_w, img_h = img.size
                if img_w > 0 and img_h > 0:
                    aspect = img_h / float(img_w)
                    max_w = 4.2 * cm
                    max_h = 1.6 * cm
                    target_w = max_w
                    target_h = target_w * aspect
                    if target_h > max_h:
                        target_h = max_h
                        target_w = target_h / aspect
                    logo_d = RLImage(BytesIO(logo_bytes), width=target_w, height=target_h)
            except Exception:
                logo_d = None
        if not logo_d:
            logo_d = Spacer(4.2 * cm, 1.2 * cm)

        p_title = Paragraph(f"<b><font size='18' color='#1d4ed8'>{company_name.upper()}</font></b>", ParagraphStyle('wcr_hdr_title', parent=styles['Normal'], fontName='Helvetica-Bold', leading=20))
        p_gst = Paragraph(f"<b><font size='9' color='#1d4ed8'>GST NO – {gst_no}</font></b>", ParagraphStyle('wcr_hdr_gst', parent=styles['Normal'], fontName='Helvetica-Bold', alignment=2, leading=14))
        
        t_hdr = Table([[logo_d, p_title, p_gst]], colWidths=[4.2 * cm, 8.8 * cm, 5.6 * cm])
        t_hdr.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        
        # Solid Blue Divider Line
        t_div = Table([[""]], colWidths=[18.6 * cm])
        t_div.setStyle(TableStyle([
            ('LINEABOVE', (0, 0), (-1, -1), 1.5, colors.HexColor('#1d4ed8')),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        return [t_hdr, Spacer(1, 0.1 * cm), t_div, Spacer(1, 0.2 * cm)]

    # Real-Time Data Extraction (No Hardcoded Fallbacks or Placeholders)
    stages_dict = dict(client.get("stages") or {})
    ob_dict = dict(stages_dict.get("onboarding_data") or {})

    client_name = (client.get('full_name') or client.get('name') or '').strip()
    consumer_num = str(client.get('consumer_number') or '').strip()
    client_addr = (client.get('address') or '').strip()
    city = (client.get('city') or '').strip()
    pincode = str(client.get('pincode') or '').strip()
    site_addr = f"{client_addr}{', ' + city if city else ''}{' - ' + pincode if pincode else ''}".strip(', -')
    
    category = (client.get('consumer_type') or client.get('consumer_category') or client.get('category') or ob_dict.get('consumer_type') or ob_dict.get('consumer_category') or ob_dict.get('category') or '').strip()
    section_no = str(client.get('section_number') or client.get('section_no') or ob_dict.get('section_number') or ob_dict.get('section_no') or '').strip()

    sol_kw = str(client.get('system_kw') or client.get('capacity') or '').strip()
    sol_kw_str = f"{sol_kw} KW" if sol_kw else ""
    sol_wp = str(client.get('panel_wattage') or client.get('panel_wp') or ob_dict.get('panel_wattage') or '').strip()
    sol_wp_str = f"{sol_wp} WP" if sol_wp else ""
    num_panels = str(client.get('num_panels') or client.get('panel_quantity') or ob_dict.get('num_panels') or '').strip()
    num_panels_str = f"{num_panels} NOS" if num_panels else ""
    panel_make = (client.get('panel_brand') or client.get('panel_make') or ob_dict.get('panel_brand') or ob_dict.get('panel_make') or '').strip()
    panel_tech = (client.get('panel_technology') or client.get('panel_tech') or ob_dict.get('panel_technology') or ob_dict.get('panel_tech') or '').strip()

    if sol_wp_str and panel_tech:
        sol_wp_tech_str = f"{sol_wp_str} / {panel_tech}"
    elif sol_wp_str:
        sol_wp_tech_str = sol_wp_str
    else:
        sol_wp_tech_str = panel_tech

    almm_model = str(client.get('almm_model_number') or sol_wp_tech_str).strip()

    inverter_brand = (client.get('inverter_brand') or client.get('inverter_make') or ob_dict.get('inverter_brand') or ob_dict.get('inverter_make') or '').strip()
    inverter_model = (client.get('inverter_model') or ob_dict.get('inverter_model') or '').strip()
    if inverter_brand and inverter_model and inverter_model.lower() not in inverter_brand.lower():
        inverter_make = f"{inverter_brand} {inverter_model}"
    else:
        inverter_make = inverter_brand or inverter_model

    inverter_kw = str(client.get('inverter_capacity') or ob_dict.get('inverter_capacity') or '').strip()
    inverter_kw_str = f"{inverter_kw}" if "KW" in inverter_kw.upper() else (f"{inverter_kw} KW" if inverter_kw else "")
    inverter_sr = str(client.get('inverter_serial') or client.get('inverter_sr') or ob_dict.get('inverter_serial') or ob_dict.get('inverter_sr') or '').strip()
    inverter_year = str(client.get('inverter_year') or client.get('manufacturing_year') or client.get('year_of_manufacture') or ob_dict.get('inverter_year') or ob_dict.get('manufacturing_year') or ob_dict.get('year_of_manufacture') or '').strip()

    # --- PAGE 1: 3-Column Inspection Table ---
    for item in _build_header():
        story.append(item)

    story.append(Paragraph("<b>Work Completion Report for Solar Power Plant</b>", STYLE_TITLE))
    story.append(Spacer(1, 0.1 * cm))

    cell_hdr = lambda txt: Paragraph(f"<b><font size='9' color='#0f172a'>{txt}</font></b>", ParagraphStyle('c_hdr', parent=styles['Normal'], fontName='Helvetica-Bold', alignment=1))
    cell_lbl = lambda txt: Paragraph(f"<b><font size='8.5' color='#1e293b'>{txt}</font></b>", ParagraphStyle('c_lbl', parent=styles['Normal'], fontName='Helvetica-Bold'))
    cell_obs = lambda txt: Paragraph(f"<font size='8.5' color='#1e293b'>{txt}</font>", ParagraphStyle('c_obs', parent=styles['Normal']))
    cell_val = lambda txt: Paragraph(f"<b><font size='8.5' color='#0f172a'>{txt}</font></b>", ParagraphStyle('c_val', parent=styles['Normal'], alignment=1))
    cell_subhdr = lambda txt: Paragraph(f"<b><font size='9' color='#0f172a'>{txt}</font></b>", ParagraphStyle('c_subhdr', parent=styles['Normal'], fontName='Helvetica-Bold', alignment=1))

    table_data = [
        [cell_hdr("Sr.No"), cell_hdr("Component"), cell_hdr("Observation")],
        [cell_obs("1"), cell_lbl("Name"), cell_val(client_name)],
        [cell_obs("2"), cell_lbl("Consumer number"), cell_val(consumer_num)],
        [cell_obs("3"), cell_lbl("Site/Location with Complete Address"), cell_val(site_addr)],
        [cell_obs("4"), cell_lbl("Category: Govt/Private Sector"), cell_val(category)],
        [cell_obs("5"), cell_lbl("Section number"), cell_val(section_no)],
        [cell_obs("6"), cell_lbl("Sanctioned Capacity of solar PV system (KW) Installed"), cell_val(sol_kw_str)],
        ["", cell_lbl("Capacity of solar PV system (KW)"), cell_val(sol_kw_str)],
        [cell_subhdr("Specification of the Modules"), "", ""],
        [cell_obs("7"), cell_lbl("Make & Type of modules"), cell_val(panel_make)],
        ["", cell_lbl("ALMM Model Number"), cell_val(almm_model)],
        ["", cell_lbl("Wattage per module"), cell_val(sol_wp_str)],
        ["", cell_lbl("No. of Module"), cell_val(num_panels_str)],
        ["", cell_lbl("Total Capacity (KWP)"), cell_val(sol_kw_str)],
        ["", cell_lbl("Warrantee Details (Product + Performance)"), cell_val("12+15 YEARS" if sol_kw else "")],
        [cell_subhdr("PCU"), "", ""],
        [cell_obs("8"), cell_lbl("Make & Model number of Inverter"), cell_val(inverter_make)],
        ["", cell_lbl("Rating"), cell_val(inverter_kw_str)],
        ["", cell_lbl("Type of charge controller/ MPPT"), cell_val("MPPT" if inverter_make else "")],
        ["", cell_lbl("Capacity of Inverter"), cell_val(inverter_kw_str)],
        ["", cell_lbl("SR Number"), cell_val(inverter_sr)],
        ["", cell_lbl("Year of manufacturing"), cell_val(inverter_year)],
        [cell_subhdr("EARTHING & PROTACTION"), "", ""],
        [cell_obs("9"), cell_lbl("No of Separate Earthings with earth Resistance"), cell_val("NON_TRACKING" if sol_kw else "")],
        ["", cell_lbl("It is certified that the Earth Resistance measure in presence of Licensed Electrical Contractor/Supervisor and found in order i.e. < 5 Ohms as per MNRE OM Dtd. 07.06.24 for CFA Component."), cell_val("")],
        ["", cell_lbl("Lightening Arrester"), cell_val("Yes" if sol_kw else "")],
    ]

    t1 = Table(table_data, colWidths=[1.0 * cm, 8.5 * cm, 9.1 * cm])
    t1.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.6, colors.HexColor('#64748b')),
        ('SPAN', (0, 8), (2, 8)),
        ('BACKGROUND', (0, 8), (2, 8), colors.HexColor('#f1f5f9')),
        ('SPAN', (0, 15), (2, 15)),
        ('BACKGROUND', (0, 15), (2, 15), colors.HexColor('#f1f5f9')),
        ('SPAN', (0, 22), (2, 22)),
        ('BACKGROUND', (0, 22), (2, 22), colors.HexColor('#f1f5f9')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
    ]))
    story.append(t1)
    story.append(Spacer(1, 0.4 * cm))

    # Clean Signature Page 1
    sign1 = Table([
        [
            Paragraph(f"<b>Authorized Signature [Vendor]</b><br/><br/><br/>For <b>{company_name.upper()}</b>", STYLE_VAL),
            Paragraph(f"<b>Consumer Signature</b><br/><br/><br/><b>{client_name}</b>", ParagraphStyle('sig_c1', parent=styles['Normal'], alignment=2))
        ]
    ], colWidths=[9.3 * cm, 9.3 * cm])
    sign1.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(sign1)
    story.append(PageBreak())

    # --- PAGE 2: DECLARATION & UNDERTAKING ---
    for item in _build_header():
        story.append(item)

    story.append(Spacer(1, 0.3 * cm))
    p1_text = (
        f"We <b>{company_name}</b> [Vendor] & <b>{client_name}</b> [Consumer] bearing Consumer Number "
        f"<b>{consumer_num}</b> Ensured structural stability of installed solar power plant and obtained "
        f"requisite permissions from the concerned authority. If in future, by virtue of any means "
        f"due to collapsing or damage to the installed solar power plant, MSEDCL will not be held "
        f"responsible for any loss to property or human life, if any."
    )
    story.append(Paragraph(p1_text, STYLE_BODY_JUSTIFY))
    story.append(Spacer(1, 0.2 * cm))

    p2_text = (
        "This is to Certify above Installed Solar PV System is working properly with electrical safety & "
        "Islanding switch in case of any presence of backup inverter an arrangement should be made in "
        "such way the backup inverter supply should never be synchronized with solar inverter to avoid "
        "any electrical accident due to back feeding. We will be held responsible for non-working of "
        "islanding mechanism and back feed to the de-energized grid."
    )
    story.append(Paragraph(p2_text, STYLE_BODY_JUSTIFY))
    story.append(Spacer(1, 1.5 * cm))

    sign2 = Table([
        [
            Paragraph(f"<b>Authorized Signature [Vendor]</b><br/><br/><br/>For <b>{company_name.upper()}</b>", STYLE_VAL),
            Paragraph(f"<b>Consumer Signature</b><br/><br/><br/><b>{client_name}</b>", ParagraphStyle('sig_c2', parent=styles['Normal'], alignment=2))
        ]
    ], colWidths=[9.3 * cm, 9.3 * cm])
    sign2.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(sign2)
    story.append(PageBreak())

    # --- PAGE 3: GUARANTEE CERTIFICATE UNDERTAKING ---
    for item in _build_header():
        story.append(item)

    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph("<b>Guarantee Certificate Undertaking to be submitted by VENDOR</b>", STYLE_TITLE))
    story.append(Spacer(1, 0.2 * cm))

    body3_text = (
        "The undersigned will provide services to the consumers for repairs/maintenance of the "
        "RTS plant free of cost for 5 years of the comprehensive Maintenance Contract (CMC) period "
        "from the date of commissioning of the plant. Nonperforming/under-performing system "
        "components will be replaced/repaired free of cost in the CMC period"
    )
    story.append(Paragraph(body3_text, STYLE_BODY_JUSTIFY))
    story.append(Spacer(1, 0.3 * cm))

    aadhaar_num = str(client.get('aadhaar') or client.get('aadhaar_number') or '').strip()

    # Aadhaar Identity Box
    aadhaar_box_data = [
        [Paragraph("<b>[ CONSUMER AADHAAR CARD / IDENTITY VERIFICATION ]</b>", ParagraphStyle('a_hdr', parent=styles['Normal'], alignment=1, fontSize=9, fontName='Helvetica-Bold', textColor=colors.HexColor('#1e3a8a')))],
        [Paragraph(
            f"<b>Stamp & Seal</b><br/><br/>"
            f"<b>Identity Details of Consumer: - ADHAR CARD</b><br/>"
            f"<b>Aadhar Number: {aadhaar_num}</b>" if aadhaar_num else "<b>Identity Details of Consumer: - ADHAR CARD</b>",
            ParagraphStyle('a_body', parent=styles['Normal'], fontSize=8.5, leading=13, textColor=colors.HexColor('#1e293b'))
        )]
    ]
    aadhaar_table = Table(aadhaar_box_data, colWidths=[14 * cm])
    aadhaar_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#3b82f6')),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#eff6ff')),
        ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor('#f8fafc')),
        ('PADDING', (0, 0), (-1, -1), 8),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
    ]))
    story.append(aadhaar_table)
    story.append(Spacer(1, 1.0 * cm))

    sign3 = Table([
        [
            Paragraph(f"<b>Authorized Signature [Vendor]</b><br/><br/><br/>For <b>{company_name.upper()}</b>", STYLE_VAL),
            Paragraph(f"<b>Consumer Signature</b><br/><br/><br/><b>{client_name}</b>", ParagraphStyle('sig_c3', parent=styles['Normal'], alignment=2))
        ]
    ], colWidths=[9.3 * cm, 9.3 * cm])
    sign3.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(sign3)

    pdf.build(story, canvasmaker=WCRCanvas)
    return buf.getvalue()


def _build_sldr_drawing(sol_kw="5", sol_wp="540", num_panels="10", panel_make="GVP SOLAR", inverter_make="GROWATT", inverter_kw="5"):
    d = Drawing(490, 370)
    d.add(Rect(0, 0, 490, 370, fillColor=colors.HexColor("#ffffff"), strokeColor=colors.HexColor("#334155"), strokeWidth=1))
    
    d.add(String(245, 355, "Grid Tied Solar Inverter System Electrical Single Line Diagram", fontName="Helvetica-Bold", fontSize=9.5, textAnchor="middle", fillColor=colors.HexColor("#1e293b")))

    # 1. PV Modules Array (Left Side: 2 Vertical Strings of Small Panel Rectangles with Junction Boxes)
    # Column 1 (x=22) & Column 2 (x=62)
    for col in range(2):
        cx = 22 + col * 40
        for row in range(4):
            ry = 285 - row * 43
            # Individual Solar Panel Rectangle
            d.add(Rect(cx, ry, 30, 38, fillColor=colors.HexColor("#f8fafc"), strokeColor=colors.HexColor("#0284c7"), strokeWidth=1))
            # Internal Solar Cell Grid Lines (3x2 grid)
            d.add(Line(cx+10, ry, cx+10, ry+38, strokeColor=colors.HexColor("#cbd5e1"), strokeWidth=0.5))
            d.add(Line(cx+20, ry, cx+20, ry+38, strokeColor=colors.HexColor("#cbd5e1"), strokeWidth=0.5))
            d.add(Line(cx, ry+19, cx+30, ry+19, strokeColor=colors.HexColor("#cbd5e1"), strokeWidth=0.5))
            
            # Embedded Junction Box with + / - Terminals
            d.add(Rect(cx+7, ry+13, 16, 12, rx=1, ry=1, fillColor=colors.HexColor("#ffffff"), strokeColor=colors.HexColor("#0369a1"), strokeWidth=0.6))
            d.add(String(cx+15, ry+19, "Junction", fontName="Helvetica-Bold", fontSize=4.5, textAnchor="middle", fillColor=colors.HexColor("#0369a1")))
            d.add(String(cx+15, ry+14, "box", fontName="Helvetica-Bold", fontSize=4.5, textAnchor="middle", fillColor=colors.HexColor("#0369a1")))
            d.add(String(cx+3, ry+31, "+", fontName="Helvetica-Bold", fontSize=5.5, fillColor=colors.HexColor("#dc2626")))
            d.add(String(cx+22, ry+31, "-", fontName="Helvetica-Bold", fontSize=5.5, fillColor=colors.HexColor("#1e293b")))

    # Interconnecting String Wiring
    d.add(Line(37, 323, 37, 156, strokeColor=colors.HexColor("#0284c7"), strokeWidth=1))
    d.add(Line(77, 323, 77, 156, strokeColor=colors.HexColor("#0284c7"), strokeWidth=1))

    d.add(String(57, 142, f"PV Array: {num_panels} x {sol_wp}Wp", fontName="Helvetica-Bold", fontSize=7.5, textAnchor="middle", fillColor=colors.HexColor("#0f172a")))

    # PV Ground Earth Wire (Green)
    d.add(Line(37, 140, 37, 50, strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.2))
    d.add(Line(27, 50, 47, 50, strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.2))
    d.add(Line(30, 46, 44, 46, strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.2))
    d.add(Line(33, 42, 41, 42, strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.2))
    d.add(String(37, 30, "Ground Earth", fontName="Helvetica", fontSize=7, textAnchor="middle", fillColor=colors.HexColor("#15803d")))

    # DC Output Conductors from PV Array (Red)
    d.add(Line(77, 156, 77, 75, strokeColor=colors.HexColor("#dc2626"), strokeWidth=1.5))
    d.add(Line(77, 75, 140, 75, strokeColor=colors.HexColor("#dc2626"), strokeWidth=1.5))
    d.add(String(108, 83, "DC240V", fontName="Helvetica-Bold", fontSize=7, textAnchor="middle", fillColor=colors.HexColor("#b91c1c")))
    d.add(String(108, 65, "8.31A", fontName="Helvetica-Bold", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#b91c1c")))

    # 2. DC Isolator Box
    d.add(Rect(140, 52, 55, 45, rx=3, ry=3, fillColor=colors.HexColor("#fef2f2"), strokeColor=colors.HexColor("#ef4444"), strokeWidth=1))
    d.add(Line(150, 75, 180, 75, strokeColor=colors.HexColor("#dc2626"), strokeWidth=1.2))
    d.add(Circle(155, 75, 2.5, fillColor=colors.HexColor("#dc2626"), strokeColor=colors.HexColor("#dc2626")))
    d.add(Circle(175, 75, 2.5, fillColor=colors.HexColor("#dc2626"), strokeColor=colors.HexColor("#dc2626")))
    d.add(Line(155, 75, 172, 83, strokeColor=colors.HexColor("#dc2626"), strokeWidth=1.5))
    d.add(String(167, 38, "DC Isolator", fontName="Helvetica-Bold", fontSize=7.5, textAnchor="middle", fillColor=colors.HexColor("#991b1b")))
    d.add(String(167, 28, "B 31A", fontName="Helvetica", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#7f1d1d")))

    d.add(Line(195, 75, 225, 75, strokeColor=colors.HexColor("#dc2626"), strokeWidth=1.5))
    d.add(Line(225, 75, 225, 140, strokeColor=colors.HexColor("#dc2626"), strokeWidth=1.5))

    # 3. Grid Tied Solar Inverter Box (Enlarged Height & Spacing)
    d.add(Rect(200, 140, 130, 175, rx=8, ry=8, fillColor=colors.HexColor("#f8fafc"), strokeColor=colors.HexColor("#1e293b"), strokeWidth=1.5))
    d.add(String(265, 302, "Grid Tied Solar Inverter", fontName="Helvetica-Bold", fontSize=8.5, textAnchor="middle", fillColor=colors.HexColor("#0f172a")))
    
    # Wi-Fi Monitor Plug
    d.add(Rect(286, 276, 36, 18, rx=3, ry=3, fillColor=colors.HexColor("#e0f2fe"), strokeColor=colors.HexColor("#0284c7"), strokeWidth=1))
    d.add(String(304, 285, "Wi-Fi Plug", fontName="Helvetica-Bold", fontSize=5.5, textAnchor="middle", fillColor=colors.HexColor("#0369a1")))
    d.add(String(304, 279, "(Monitor)", fontName="Helvetica", fontSize=5, textAnchor="middle", fillColor=colors.HexColor("#0284c7")))
    d.add(String(304, 297, "((( Wi-Fi )))", fontName="Helvetica", fontSize=5.5, textAnchor="middle", fillColor=colors.HexColor("#0284c7")))

    # Converter Compartments (DC & AC)
    d.add(Rect(218, 165, 44, 44, fillColor=colors.HexColor("#ffffff"), strokeColor=colors.HexColor("#475569"), strokeWidth=1))
    d.add(String(240, 183, "DC", fontName="Helvetica-Bold", fontSize=9.5, textAnchor="middle", fillColor=colors.HexColor("#334155")))
    
    d.add(Rect(218, 225, 44, 44, fillColor=colors.HexColor("#ffffff"), strokeColor=colors.HexColor("#475569"), strokeWidth=1))
    d.add(String(240, 243, "AC", fontName="Helvetica-Bold", fontSize=9.5, textAnchor="middle", fillColor=colors.HexColor("#334155")))

    d.add(Line(240, 209, 240, 225, strokeColor=colors.HexColor("#2563eb"), strokeWidth=1.5))
    d.add(String(215, 146, "DC In", fontName="Helvetica-Bold", fontSize=6.5, fillColor=colors.HexColor("#64748b")))
    d.add(String(290, 146, "AC Out", fontName="Helvetica-Bold", fontSize=6.5, fillColor=colors.HexColor("#64748b")))
    d.add(String(265, 126, f"Make: {inverter_make} ({inverter_kw})", fontName="Helvetica-Bold", fontSize=7.5, textAnchor="middle", fillColor=colors.HexColor("#1e293b")))

    d.add(Line(330, 175, 355, 175, strokeColor=colors.HexColor("#2563eb"), strokeWidth=1.5))
    d.add(String(342, 182, "AC 230V", fontName="Helvetica-Bold", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#1d4ed8")))
    d.add(String(342, 164, "8.7A", fontName="Helvetica-Bold", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#1d4ed8")))

    # 4. AC Breaker Box
    d.add(Rect(355, 153, 44, 44, rx=3, ry=3, fillColor=colors.HexColor("#eff6ff"), strokeColor=colors.HexColor("#3b82f6"), strokeWidth=1))
    d.add(Line(365, 175, 389, 175, strokeColor=colors.HexColor("#1d4ed8"), strokeWidth=1.2))
    d.add(Circle(368, 175, 2, fillColor=colors.HexColor("#1d4ed8"), strokeColor=colors.HexColor("#1d4ed8")))
    d.add(Circle(386, 175, 2, fillColor=colors.HexColor("#1d4ed8"), strokeColor=colors.HexColor("#1d4ed8")))
    d.add(Line(368, 175, 384, 182, strokeColor=colors.HexColor("#1d4ed8"), strokeWidth=1.5))
    d.add(String(377, 140, "AC Breaker", fontName="Helvetica-Bold", fontSize=7.5, textAnchor="middle", fillColor=colors.HexColor("#1e40af")))

    d.add(Line(399, 175, 420, 175, strokeColor=colors.HexColor("#2563eb"), strokeWidth=1.5))

    # 5. Main Distribution Panel & Utility Grid Meter (Taller Box)
    d.add(Rect(420, 90, 62, 235, rx=5, ry=5, fillColor=colors.HexColor("#f8fafc"), strokeColor=colors.HexColor("#0f172a"), strokeWidth=1.5))
    d.add(String(451, 312, "Main Distribution", fontName="Helvetica-Bold", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#0f172a")))
    d.add(String(451, 303, "Panel", fontName="Helvetica-Bold", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#0f172a")))

    # Meter Box
    d.add(Rect(427, 245, 48, 48, fillColor=colors.HexColor("#ffffff"), strokeColor=colors.HexColor("#0284c7"), strokeWidth=1))
    d.add(Circle(451, 273, 12, fillColor=colors.HexColor("#f0f9ff"), strokeColor=colors.HexColor("#0284c7"), strokeWidth=0.8))
    d.add(String(451, 270, "Meter", fontName="Helvetica-Bold", fontSize=8, textAnchor="middle", fillColor=colors.HexColor("#0369a1")))
    d.add(String(451, 252, "[ P14 ]", fontName="Helvetica", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#0284c7")))

    # Main Switch / PSE Box
    d.add(Rect(427, 155, 48, 38, fillColor=colors.HexColor("#ffffff"), strokeColor=colors.HexColor("#475569"), strokeWidth=1))
    d.add(String(451, 174, "Main Switch", fontName="Helvetica-Bold", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#334155")))
    d.add(String(451, 163, "[ PSE ]", fontName="Helvetica-Bold", fontSize=6, textAnchor="middle", fillColor=colors.HexColor("#475569")))

    # Utility Grid Connection Line
    d.add(Line(475, 269, 488, 269, strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.5))
    d.add(PolyLine([484, 273, 489, 269, 484, 265], strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.5, fillColor=colors.HexColor("#16a34a")))
    d.add(String(451, 296, "To Utility Grid", fontName="Helvetica-Bold", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#15803d")))

    # Local Load Connection Line
    d.add(Line(475, 174, 488, 174, strokeColor=colors.HexColor("#d97706"), strokeWidth=1.5))
    d.add(PolyLine([484, 178, 489, 174, 484, 170], strokeColor=colors.HexColor("#d97706"), strokeWidth=1.5, fillColor=colors.HexColor("#d97706")))
    d.add(String(451, 144, "To Local Load", fontName="Helvetica-Bold", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor("#b45309")))

    # Main Panel Ground Earth Wire
    d.add(Line(451, 90, 451, 50, strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.2))
    d.add(Line(441, 50, 461, 50, strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.2))
    d.add(Line(444, 46, 458, 46, strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.2))
    d.add(Line(447, 42, 455, 42, strokeColor=colors.HexColor("#16a34a"), strokeWidth=1.2))
    d.add(String(451, 30, "Ground Earth", fontName="Helvetica", fontSize=7, textAnchor="middle", fillColor=colors.HexColor("#15803d")))

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

    client_name = (client.get('full_name') or client.get('name') or '').upper()
    consumer_num = client.get('consumer_number') or ''
    bu_num = client.get('bu_number') or client.get('billing_unit') or ''
    sol_kw = str(client.get('system_kw') or '')
    sol_wp = str(client.get('panel_wattage') or '')
    num_panels = str(client.get('num_panels') or '')
    panel_make = (client.get('panel_brand') or client.get('panel_make') or '').upper()
    inverter_make = (client.get('inverter_make') or '').upper()
    inverter_kw = str(client.get('inverter_capacity') or (f"{sol_kw} KW" if sol_kw else "")).upper()

    company_name = (company.get('company_name') or '').upper()

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

    inverter_kw_display = f"{inverter_kw}" if "KW" in inverter_kw.upper() else (f"{inverter_kw} kW" if inverter_kw else "")

    tech_table_data = [
        [Paragraph("<b>PARAMETER</b>", STYLE_TBL_HDR), Paragraph("<b>SPECIFICATIONS</b>", STYLE_TBL_HDR), Paragraph("<b>MAKE</b>", STYLE_TBL_HDR), Paragraph("<b>KWP</b>", STYLE_TBL_HDR)],
        [Paragraph("PV MODULES", STYLE_TBL_CELL), Paragraph(f"{sol_wp} Wp X {num_panels} Nos", STYLE_TBL_CELL), Paragraph(panel_make, STYLE_TBL_CELL), Paragraph(f"{sol_kw} KW", STYLE_TBL_CELL)],
        [Paragraph("INVERTER", STYLE_TBL_CELL), Paragraph(f"{inverter_kw_display} × 1 Nos", STYLE_TBL_CELL), Paragraph(inverter_make, STYLE_TBL_CELL), Paragraph(f"{inverter_kw}", STYLE_TBL_CELL)],
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
            Paragraph(f"<b>{company_name}</b>", STYLE_FTR),
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
        leftMargin=1.6 * cm,
        rightMargin=1.6 * cm,
        topMargin=1.3 * cm,
        bottomMargin=1.3 * cm
    )
    story = []

    # Dynamic Data Extraction
    client_name = (client.get("full_name") or client.get("name") or "").strip()
    consumer_no = str(client.get("consumer_number") or "").strip()
    client_addr = (client.get("address") or "").strip()
    city = (client.get("city") or "").strip()
    pincode = str(client.get("pincode") or "").strip()
    full_address = f"{client_addr}{', ' + city if city else ''}{' - ' + pincode if pincode else ''}".strip(", -")
    
    system_kw = str(client.get("system_kw") or client.get("capacity") or "").strip()
    
    date_str = client.get("installation_date") or client.get("created_at") or datetime.now().strftime("%d/%m/%Y")
    if len(date_str) > 10:
        date_str = date_str[:10]
        
    company_name = company.get("company_name") or ""
    # BU Number and BU Text from onboarding (enriched via _enrich_client_doc before this call)
    bu_no = client.get("bu_number") or client.get("bu_no") or ""
    bu_text = client.get("bu_text") or ""
    # sub_div: use bu_text if available, else fall back to sub_division field (leave blank if both empty)
    sub_div = bu_text or client.get("sub_division") or ""
    division = client.get("division") or ""

    # Define Styles (Refined font sizing & spacing for exact 5-page layout with compact vertical gaps)
    style_h1 = ParagraphStyle('NMA_H1', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=14, leading=17, alignment=1, spaceBefore=4, spaceAfter=3)
    style_h2 = ParagraphStyle('NMA_H2', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=12, leading=15, alignment=1, spaceAfter=8)
    style_clause_h = ParagraphStyle('NMA_ClauseH', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9.5, leading=12.5, spaceBefore=4, spaceAfter=1.5)
    style_body = ParagraphStyle('NMA_Body', parent=styles['Normal'], fontName='Helvetica', fontSize=8.5, leading=11.0, alignment=4, spaceBefore=0, spaceAfter=2)
    style_body_bold = ParagraphStyle('NMA_BodyBold', parent=style_body, fontName='Helvetica-Bold')

    # ==================== PAGE 1 (AGREEMENT PREAMBLE) ====================
    story.append(Paragraph("<b>ANNEXURE – 3</b>", style_h1))
    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph("<b>Net Metering Connection Agreement</b>", style_h2))
    story.append(Spacer(1, 0.4 * cm))

    preamble_p1 = (
        f"This Agreement is made and entered into at (location) <b>{city}</b> on this "
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

    # ==================== CONTINUOUS DYNAMIC FLOW (PAGES 2 - END) ====================
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

    witness_intro = Paragraph(
        f"In the witness where of <b>{client_name}</b> for and on behalf of Eligible Consumer and Shri. "
        f"Additional Executive Engineer <b>{sub_div}/ MSEDCL</b>, for and on behalf of MSEDCL agree to this agreement.",
        style_body
    )

    # Signature Table (Aligned cleanly with consumer left, MSEDCL right, Witnesses aligned)
    sig_table_data = [
        [
            Paragraph(f"<b>Signature of Eligible Consumer</b><br/><br/><br/>___________________________<br/><b>{client_name}</b><br/>Eligible Consumer", style_body),
            Paragraph(f"<b>Signature of Licensee</b><br/><br/><br/>Shri. ___________________________<br/>Additional Executive Engineer<br/>for and on behalf of MSEDCL", style_body)
        ],
        [
            Paragraph("<br/><b>Witness 1:</b> ___________________________", style_body),
            Paragraph("<br/><b>Witness 1:</b> ___________________________", style_body)
        ],
        [
            Paragraph("<b>Witness 2:</b> ___________________________", style_body),
            Paragraph("<b>Witness 2:</b> ___________________________", style_body)
        ],
        [
            Paragraph(f"<br/><br/><b>{company_name}</b><br/>Proprietor / Authorized Manager", style_body),
            Paragraph("<br/><br/><b>Official Stamp / Seal</b>", style_body)
        ]
    ]
    t_sig = Table(sig_table_data, colWidths=[9.0 * cm, 9.0 * cm])
    t_sig.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))

    sig_block = KeepTogether([
        Spacer(1, 0.4 * cm),
        witness_intro,
        Spacer(1, 0.6 * cm),
        t_sig
    ])
    story.append(sig_block)

    pdf.build(story, canvasmaker=NetMeterCanvas)
    return buf.getvalue()


class VendorCanvas(canvas.Canvas):
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
        self.drawCentredString(10.5 * cm, 0.8 * cm, "Rooftop Solar Vendor Agreement")
        self.drawRightString(21.0 * cm - 1.5 * cm, 0.8 * cm, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()


def generate_vendor_agreement_pdf(client: dict, company: dict) -> bytes:
    buf = BytesIO()
    pdf = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.6 * cm,
        rightMargin=1.6 * cm,
        topMargin=1.3 * cm,
        bottomMargin=1.3 * cm
    )
    story = []

    # Dynamic Data Extraction
    client_name = (client.get("full_name") or client.get("name") or "").strip()
    consumer_no = str(client.get("consumer_number") or "").strip()
    client_addr = (client.get("address") or "").strip()
    city = (client.get("city") or "").strip()
    pincode = str(client.get("pincode") or "").strip()
    full_address = f"{client_addr}{', ' + city if city else ''}{' - ' + pincode if pincode else ''}".strip(", -")
    
    system_kw = str(client.get("system_kw") or client.get("capacity") or "").strip()
    panel_make = (client.get("panel_brand") or client.get("panel_make") or "").strip()
    panel_wattage = str(client.get("panel_wattage") or "").strip()
    inverter_make = (client.get("inverter_make") or "").strip()
    inverter_kw = str(client.get("inverter_capacity") or client.get("system_kw") or "").strip()
    total_cost = str(client.get("total_cost") or client.get("quotation_amount") or "").strip()
    
    date_obj = datetime.now()
    day_str = date_obj.strftime("%d")
    month_str = date_obj.strftime("%m")
    year_str = date_obj.strftime("%Y")

    company_name = company.get("company_name") or ""
    company_address = company.get("address") or ""
    company_pincode = company.get("pincode") or ""

    # Define Styles
    style_h1 = ParagraphStyle('VA_H1', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=14, leading=17, alignment=1, spaceBefore=4, spaceAfter=3)
    style_sub = ParagraphStyle('VA_Sub', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, leading=12, alignment=1, spaceAfter=6)
    style_center_b = ParagraphStyle('VA_CenterB', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10, leading=13, alignment=1, spaceBefore=4, spaceAfter=4)
    style_clause_h = ParagraphStyle('VA_ClauseH', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9.5, leading=12.5, spaceBefore=5, spaceAfter=2)
    style_body = ParagraphStyle('VA_Body', parent=styles['Normal'], fontName='Helvetica', fontSize=8.5, leading=11.0, alignment=4, spaceBefore=0, spaceAfter=2)
    style_body_bold = ParagraphStyle('VA_BodyBold', parent=style_body, fontName='Helvetica-Bold')

    # ==================== PREAMBLE & TITLES ====================
    story.append(Paragraph("<u><b>Agreement Between</b></u>", style_h1))
    story.append(Paragraph("<b>Applicant and the registered/empaneled Vendor for installation of rooftop solar system in residential house of the Applicant under simplified procedure of Rooftop Solar Program Ph-II</b>", style_sub))
    story.append(Spacer(1, 0.2 * cm))

    exec_p = (
        f"This agreement is executed on (Day) <b>{day_str}</b> , (Month) <b>{month_str}</b> , (Year) <b>{year_str}</b> "
        f"for design, installation, commissioning and five years comprehensive maintenance of rooftop solar system "
        f"to be installed undersimplified procedure of Rooftop Solar Program Ph-II."
    )
    story.append(Paragraph(exec_p, style_body))
    story.append(Spacer(1, 0.2 * cm))

    story.append(Paragraph("<b>Between</b>", style_center_b))
    applicant_p = (
        f"<b>{client_name}</b> has residential electricity connection with consumer number <b>{consumer_no}</b> "
        f"from MSEDCL (DISCOM) at <b>{full_address} PIN code : {pincode}</b> (Hereinafter referred to as Applicant)."
    )
    story.append(Paragraph(applicant_p, style_body))
    story.append(Spacer(1, 0.2 * cm))

    story.append(Paragraph("<b>And</b>", style_center_b))
    vendor_p = (
        f"<b>{company_name}</b> (Name of Vendor) is registered/ empaneled with the MSEDCL (hereinafter referred as DISCOM) "
        f"and is having registered/functional office at <b>{company_address} . PIN CODE- {company_pincode}</b> . "
        f"Both Applicant and the Vendor are jointly referred as Parties."
    )
    story.append(Paragraph(vendor_p, style_body))
    story.append(Spacer(1, 0.2 * cm))

    story.append(Paragraph("<b>Whereas</b>", style_body_bold))
    story.append(Paragraph("- The Applicant intends to install rooftop solar system under simplified procedure of Rooftop Solar Programmed Ph-II of the MNRE.", style_body))
    story.append(Paragraph("- The Vendor is registered/empaneled vendor with DISCOM for installation of rooftop solar under MNRE Schemes. The Vendor satisfies all the existing regulation pertaining to electrical safety and license in the respective state and it is not debarred or blacklisted from undertaking any such installations by any state/central Government agency.", style_body))
    story.append(Paragraph("- Both the parties are mutually agreed and understand their roles and responsibilities and have no liability to any other agency/firm/stakeholder especially to DISCOM and MNRE.", style_body))
    story.append(Spacer(1, 0.3 * cm))

    # ==================== SECTIONS 1 - 15 ====================
    story.append(Paragraph("<b>1. GENERAL TERMS:</b>", style_clause_h))
    story.append(Paragraph("1.1. The Applicant hereby represents and warrants that the Applicant has the sole legal capacity to enter into this Agreement and authorize the construction, installation and commissioning of the Rooftop Solar System (“RTS System”) which is inclusive of Balance of System (“BoS”) on the Applicant's premises (“Applicant Site”). The Vendor reserves its right to verify ownership of the Applicant Site and Applicant covenants to co-operate and provide all information and documentation required by the Vendor for the same.", style_body))
    story.append(Paragraph("1.2. Vendor may propose changes to the scope, nature and or schedule of the services being performed under this Agreement. All proposed changes must be mutually agreed between the Parties. If Parties fail to agree on the variation proposed, either Party may terminate this Agreement by serving notice as per Clause 13.", style_body))
    story.append(Paragraph("1.3. The Applicant understands and agrees that future changes in load, electricity usage patterns and/or electrical grid issues may affect the performance of the RTS System and these factors have not been and cannot be considered in any analysis or quotation provided by Vendor or its Authorized Persons (defined below).", style_body))

    story.append(Paragraph("<b>2. RTS System:</b>", style_clause_h))
    story.append(Paragraph(f"2.1. Total capacity of RTS System will be minimum <b>{system_kw} KWatt</b>.", style_body))
    story.append(Paragraph("2.2. The Solar modules, inverters and BoS will confirm to minimum specifications and DCR requirement of MNRE.", style_body))
    story.append(Paragraph(f"2.3. Solar modules of <b>{panel_make}</b> make model, <b>{panel_wattage} Wp</b> capacity each and <b>21.13%</b> efficiency will be procured and installed by the Vendor", style_body))
    story.append(Paragraph(f"2.4. Solar inverter of <b>{inverter_make}</b> make, model <b>{inverter_kw} KW</b> rated output capacity will be procured and installed by the Vendor", style_body))
    story.append(Paragraph("2.5. The module mounting structure must withstand minimum wind load pressure as specified by MNRE.", style_body))
    story.append(Paragraph("2.6. Other BoS installations shall be as per best industry practice with all safety and protection gears installed by the vendor.", style_body))

    story.append(Paragraph("<b>3. PRICE AND PAYMENT TERMS:</b>", style_clause_h))
    story.append(Paragraph(f"3.1. The cost of an RTS System will be <b>Rs. {total_cost}/-</b> (to be decided mutually). The Applicant shall pay the total cost to the Vendor as under:", style_body))
    story.append(Paragraph("(i) 50 % as an advance on confirmation of the order.", style_body))
    story.append(Paragraph("(ii) 40 % against Proforma Invoice (PI) before dispatch of solar panels, inverters and other BoS items to be delivered.", style_body))
    story.append(Paragraph("(iii) 10 % after installation and commissioning of the RTS System. The order value and payment terms are fixed and will not be subject to any adjustment except as approved in writing by Vendor. The payment shall be made only through bankers' cheque / NEFT / RTGS / online payment portal as intimated by Vendor. No cash payments shall be accepted by Vendor or its Authorized Person.", style_body))

    story.append(Paragraph("<b>4. REPRESENTATIONS MADE BY THE APPLICANT:</b>", style_clause_h))
    story.append(Paragraph("The Applicant acknowledges and agrees that:", style_body))
    story.append(Paragraph("4.1. any timeline or schedule shared by Vendor for the provision of services and delivery of the RTS System is only an estimate and Vendor will not be liable for any delay that is not attributable to Vendor.", style_body))
    story.append(Paragraph("4.2. all information disclosed by the Applicant to Vendor in connection with the supply of the RTS System (or any part thereof), services and generation estimation (including, without limitation, the load profile and power bill) are true and accurate and acknowledges that Vendor has relied on the information produced by the Applicant to customize the RTS System layout and BoS design for the purposes of this Agreement.", style_body))
    story.append(Paragraph("4.3. all descriptive specifications, illustrations, drawings, data, dimensions, quotation, fact sheets, price lists and any advertising material circulated/published/provided by Vendor are approximate only.", style_body))
    story.append(Paragraph("4.4. any drawings, pre-feasibility report, specifications and plans composed by Vendor shall require the Applicant's approval within 5 (five) days of its receipt by electronic mail to Vendor and if the Applicant does not respond within this period, the drawings, specifications or plans shall be final and deemed to have been approved by the Applicant.", style_body))
    story.append(Paragraph("4.5. the Applicant shall not use the RTS System or any part thereof, other than in accordance with the product manufacturer's specifications, and covenants that any risk arising from misuse or/and inappropriate use shall be to the account of the Applicant alone.", style_body))
    story.append(Paragraph("4.6. The Applicant represents, warrants and covenants that:", style_body))
    story.append(Paragraph("(i) All electrical and plumbing infrastructure at the Applicant Site are in conformity with applicable laws.", style_body))
    story.append(Paragraph("(ii) the Applicant has the legal capacity to permit unfettered access to Vendor and its Authorized Persons for the purposes of execution and performance of this Agreement.", style_body))
    story.append(Paragraph("(iii) the Applicant has and will provide requisite power, water and other requisite resources and storage facilities for construction, installation, operation and maintenance of the RTS System.", style_body))
    story.append(Paragraph("(iv) The Applicant will provide support for site fabrication of structure, assembly and fitting of module mounting structure at Applicant Site.", style_body))
    story.append(Paragraph("(v) The Applicant will ensure that the Applicant Site is shadow free and free of all encumbrances during the lifetime of the RTS System.", style_body))
    story.append(Paragraph("(vi) Applicant should ensure that the Applicant regularly cleans and ensures accessibility and safety to the RTS System, as required by Vendor and dusting frequency in the premises.", style_body))
    story.append(Paragraph("(vii) The vendor is entitled to permit geo-tagging of the Applicant Site as a Vendor installation site.", style_body))
    story.append(Paragraph("(viii) Unless otherwise intimated by the Applicant in writing, Vendor is entitled to take photographs, videos and testimonials of the Applicant and the Applicant Site, and to create content which will become the property of Vendor and the same can be freely used by Vendor as part of its promotional and marketing activities across all platforms as it deems fit;", style_body))
    story.append(Paragraph("(ix) The Applicant validates the stability of the Applicant Site for the installation of the RTS System.", style_body))

    story.append(Paragraph("<b>5. MAINTENANCE:</b>", style_clause_h))
    story.append(Paragraph("5.1. Vendor shall provide five-year free workmanship maintenance. Vendor shall visit the Applicant's premises at least once every quarter after commissioning of the RTS System for maintenance purposes.", style_body))
    story.append(Paragraph("5.2. During such maintenance visit, Vendor shall check all nuts and bolts, fuses, earth resistance and other consumables in respect of the RTS System to ensure that it is in good working condition.", style_body))
    story.append(Paragraph("5.3. Cleaning requirement/expectation from the Applicant side – Applicant responsibility, minimum expectation from Applicant that it will be cleaned regularly as per the dusting frequency.", style_body))

    story.append(Paragraph("<b>6. ACCESS AND RIGHT OF ENTRY:</b>", style_clause_h))
    story.append(Paragraph("6.1. The Applicant hereby grants permission to Vendor and its authorized personnel, representatives, associates, officers, employees, financing agents, subcontractors (“Authorized Persons”) to enter the Applicant Site for the purposes of:", style_body))
    story.append(Paragraph("(a) conducting feasibility study.", style_body))
    story.append(Paragraph("(b) storing the RTS System/any part thereof.", style_body))
    story.append(Paragraph("(c) installing the RTS System.", style_body))
    story.append(Paragraph("(d) inspecting the RTS System.", style_body))
    story.append(Paragraph("(e) conducting repairs and maintenance to the RTS System.", style_body))
    story.append(Paragraph("(f) removing the RTS System (or any part thereof), if necessary for any reason whatsoever.", style_body))
    story.append(Paragraph("(g) Such other matters as necessary to execute and perform its rights and obligations under this Agreement.", style_body))
    story.append(Paragraph("6.2. The Applicant shall ensure that third-party consents necessary for the Authorized Persons to access the Applicant Site are obtained prior to commencement of services under this Agreement.", style_body))

    story.append(Paragraph("<b>7. WARRANTIES:</b>", style_clause_h))
    story.append(Paragraph("7.1. Product Warranty: The Applicant shall be entitled to manufacturers' warranty. Any warranty in relation to RTS System supplied to the Applicant by Vendor under this Agreement is limited to the warranty given by the manufacturer of the RTS System (or any part thereof) to Vendor.", style_body))
    story.append(Paragraph("7.2. Installation Warranty: Vendor warrants that all installations shall be free from workmanship defects or BOS defects for a period of five years from the date of installation of the RTS System. The warranty is limited to Vendor rectifying the workmanship or BOS defects at Vendor's expense in respect of those defects reported by the Applicant, in writing. The Applicant is obliged and liable to report such defects within 15 (fifteen) days of occurrence of such defect.", style_body))
    story.append(Paragraph("7.3. Subject to manufacturer warranty, Vendor warrants that the solar modules supplied herein shall have tolerance within a five-percentage range (+/-5%). The peak-power point voltage and the peak-power point current of any supplied solar module and/or any module string (series connected modules) shall not vary by more than 5% (five percent) from the respective arithmetic means for all modules and/or for all module strings, as the case may be, provided The RTS System is properly maintained, and the Applicant Site is free from shadow at the time of operation of the RTS System.", style_body))
    story.append(Paragraph("7.4. Exceptions for warranty:", style_body))
    story.append(Paragraph("(a) Any attempt by any person other than Vendor or its Authorized Persons to adjust, modify, repair or provide maintenance to the RTS System, shall disentitle the Applicant of the warranty provided by Vendor hereunder.", style_body))
    story.append(Paragraph("(b) Vendor shall not be liable for any degeneration or damage to the RTS System due to any action or inaction on the part of the Applicant.", style_body))
    story.append(Paragraph("(c) Vendor shall not be bound or liable to remedy any damage, fault, failure or malfunction of the RTS System owing to external causes, including but not limited to accidents, misuse, neglect, if usage and/or storage and/or installation are non-confirming to product instructions, modifications by the Applicant leading to shading or accessibility issues, failure to perform required maintenance, normal wear and tear, Force Majeure Event, or negligence or default attributable to the Applicant.", style_body))
    story.append(Paragraph("(d) Vendor shall not be liable to repair or remedy any accessories or parts added to the RTS System that were not originally sourced by Vendor to the Applicant.", style_body))

    story.append(Paragraph("<b>8. PERFORMANCE GUARANTEE:</b>", style_clause_h))
    story.append(Paragraph("8.1. Vendor guarantees minimum system performance ratio of 75% as per performance ratio test carried out in adherence to IEC 61724 or equivalent BIS for a period of five years.", style_body))

    story.append(Paragraph("<b>9. INSURANCE:</b>", style_clause_h))
    story.append(Paragraph("9.1. Vendor may, at its sole discretion, obtain insurance covering risks of loss/damage to the RTS System (any part thereof) during transit from Vendor's warehouse until delivery to the Applicant Site and until installation and commissioning.", style_body))
    story.append(Paragraph("9.2. Thereafter, all risk shall pass on to the Applicant and the Applicant may accordingly procure relevant insurances.", style_body))

    story.append(Paragraph("<b>10. CANCELLATION:</b>", style_clause_h))
    story.append(Paragraph("10.1. The Applicant may cancel the order placed on Vendor within 7 (seven) days from the date of remittance of advance money or the date of order acceptance, whichever is earlier (“Order Confirmation”) by serving notice as per Clause 13.", style_body))
    story.append(Paragraph("10.2. If the Applicant cancels the order after the expiry of 7 (seven) days from the date of Order Form, the Applicant shall be liable to pay Vendor, a cancellation fee of 30 % of the total order value plus costs and expenses incurred by Vendor, including, costs for labour, design, return of products, administrative costs, subvention costs.", style_body))
    story.append(Paragraph("10.3. Notwithstanding the aforesaid, the Applicant shall not be entitled to cancel the Order Form after Vendor has dispatched the RTS System (or any part thereof, including BOS) to the Applicant Site. If Applicant chooses to terminate the Order Form after dispatch, the entire amount paid by the Applicant till date, shall be forfeited by Vendor.", style_body))

    story.append(Paragraph("<b>11. LIMITATION OF LIABILITY AND INDEMNITY:</b>", style_clause_h))
    story.append(Paragraph("11.1. To the extent that terms implied by law apply to the RTS System and the services rendered under this Agreement, Vendor's liability for any breach of those terms is limited to:", style_body))
    story.append(Paragraph("(a) repairing or replacing the RTS System/any part thereof, as applicable; or", style_body))
    story.append(Paragraph("(b) Refund of the moneys paid by the Applicant to Vendor, if Vendor cannot fulfil the order.", style_body))

    story.append(Paragraph("<b>12. SUSPENSION AND TERMINATION:</b>", style_clause_h))
    story.append(Paragraph("12.1. If the Applicant fails to pay any sum due under this Agreement on the due date, Vendor may, in addition to its other rights under this Agreement, suspend its obligations under this Agreement until all outstanding amounts (including interest due) are paid.", style_body))

    story.append(Paragraph("<b>13. NOTICES:</b>", style_clause_h))
    story.append(Paragraph("Any notice or other communication under this Agreement to Vendor and or to the Applicant, shall be in writing, in English language and shall be delivered or sent: (a) by electronic mail and/or (b) by hand delivery or registered post/courier, at the registered address of Applicant/Vendor.", style_body))

    story.append(Paragraph("<b>14. FORCE MAJEURE EVENT:</b>", style_clause_h))
    story.append(Paragraph("14.1. Neither Party shall be in default due to any delay or failure to perform its/his/her/their obligations under this Agreement which arises from or is a consequence of occurrence of an event which is beyond the reasonable control of such Party, and which makes performance of its/his/her/their obligations under this Agreement impossible or so impractical as reasonably to be considered impossible in the circumstances, and includes, but is not limited to, war, riot, civil disorder, earthquake, fire, explosion, storm, flood or other adverse weather conditions, pandemic, epidemic, embargo, strikes, lockouts, labour difficulties, other industrial action, acts of government, unavailability of equipment from vendor, changes requested by the Applicant (“Force Majeure Event”).", style_body))

    story.append(Paragraph("<b>15. GOVERNING LAW AND DISPUTE RESOLUTION:</b>", style_clause_h))
    story.append(Paragraph("15.1. The interpretation and enforcement of this Agreement shall be governed by the laws of India.", style_body))
    story.append(Paragraph("15.2. In the event of any dispute, controversy or difference between the Parties arising out of, or relating to this Agreement (“Dispute”), both Parties shall make an effort to resolve the Dispute in good faith, failing which, any Party to the Dispute shall be entitled to refer the Dispute to arbitration to resolve the Dispute in the manner set out in this Clause. The rights and obligations of the Parties under this Agreement shall remain in full force and effect pending the award in such arbitration proceeding.", style_body))
    story.append(Paragraph("15.3. The arbitration proceeding shall be governed by the provisions of the Arbitration and Conciliation Act, 1996 and shall be settled by a sole arbitrator mutually appointed by the Parties.", style_body))

    # Signature Block
    sig_table_data = [
        [
            Paragraph(f"<br/><br/>___________________________<br/>(Applicant)<br/><b>{client_name}</b>", style_body),
            Paragraph(f"<br/><br/>___________________________<br/>(Vendor)<br/><b>{company_name}</b>", style_body)
        ],
        [
            Paragraph("", style_body),
            Paragraph("<br/><br/><b>Official Stamp / Seal</b>", style_body)
        ]
    ]
    t_sig = Table(sig_table_data, colWidths=[9.0 * cm, 9.0 * cm])
    t_sig.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))

    sig_block = KeepTogether([
        Spacer(1, 0.5 * cm),
        t_sig
    ])
    story.append(sig_block)

    pdf.build(story, canvasmaker=VendorCanvas)
    return buf.getvalue()


def make_meter_testing_canvas(company: dict):
    addr = company.get("address") or "SHOP NO – 1-2, FIRST FLOOR, BUILDING NO – 1, KAPAD TEXTILE MARKET ICHALKARANJI (MAH.) - 416115"
    city = company.get("city") or ""
    pincode = company.get("pincode") or ""
    full_addr_parts = [addr]
    if city:
        full_addr_parts.append(city)
    if pincode:
        full_addr_parts.append(f"- {pincode}")
    full_addr = ", ".join(p for p in full_addr_parts if p).replace(", -", " -")
    phone = company.get("mobile") or company.get("phone") or "+91-9694060806 GIRIRAJ"

    class MeterTestingCanvas(canvas.Canvas):
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
            self.setStrokeColor(colors.HexColor('#991b1b'))
            self.setLineWidth(1.5)
            self.line(1.2 * cm, 1.4 * cm, 21.0 * cm - 1.2 * cm, 1.4 * cm)

            self.setFont("Helvetica-Bold", 7.5)
            self.setFillColor(colors.HexColor('#2563eb'))

            line1 = f"OFFICE :- {full_addr}"
            line2 = f"PHONE : {phone}"

            self.drawString(1.2 * cm, 1.0 * cm, line1)
            self.drawString(1.2 * cm, 0.65 * cm, line2)

            self.setFont("Helvetica", 8)
            self.setFillColor(colors.HexColor('#475569'))
            self.drawRightString(21.0 * cm - 1.2 * cm, 0.65 * cm, f"Page {self._pageNumber} of {page_count}")
            self.restoreState()

    return MeterTestingCanvas


def generate_meter_testing_request_pdf(client: dict, company: dict) -> bytes:
    buf = BytesIO()
    pdf = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.2 * cm,
        rightMargin=1.2 * cm,
        topMargin=1.0 * cm,
        bottomMargin=1.8 * cm
    )
    story = []

    company_name = (company.get('company_name') or 'GVP SOLAR ENERGY').strip()
    gst_no = (company.get('gst_number') or company.get('gst') or '').strip()

    stages_dict = dict(client.get("stages") or {})
    ob_dict = dict(stages_dict.get("onboarding_data") or {})

    client_name = (client.get('full_name') or client.get('name') or client.get('client_name') or ob_dict.get('full_name') or '').strip()
    consumer_num = str(client.get('consumer_number') or client.get('consumer_no') or ob_dict.get('consumer_number') or '').strip()

    client_addr = (client.get('address') or ob_dict.get('address') or '').strip()
    city = (client.get('city') or ob_dict.get('city') or '').strip()
    pincode = str(client.get('pincode') or ob_dict.get('pincode') or '').strip()

    location_parts = []
    if client_addr:
        location_parts.append(client_addr)
    if city and pincode:
        location_parts.append(f"{city} - {pincode}")
    elif city:
        location_parts.append(city)
    elif pincode:
        location_parts.append(pincode)
    location_str = ", ".join(location_parts)

    gen_make = (client.get('gen_meter_make') or client.get('generation_meter_make') or ob_dict.get('gen_meter_make') or ob_dict.get('generation_meter_make') or '').strip()
    gen_serial = (client.get('gen_meter_serial') or client.get('generation_meter_serial') or client.get('gen_meter_sn') or ob_dict.get('gen_meter_serial') or '').strip()
    net_make = (client.get('net_meter_make') or ob_dict.get('net_meter_make') or '').strip()
    net_serial = (client.get('net_meter_serial') or client.get('net_meter_sn') or ob_dict.get('net_meter_serial') or '').strip()

    def _clean_field(val: str) -> str:
        if val.upper() in ("NA", "N/A", "0", "DEFAULT", "GROWATT", "NULL", "NONE"):
            return ""
        return val

    gen_make = _clean_field(gen_make)
    gen_serial = _clean_field(gen_serial)
    net_make = _clean_field(net_make)
    net_serial = _clean_field(net_serial)

    logo_bytes = company.get("logo_bytes")
    logo_d = None
    if logo_bytes:
        try:
            from PIL import Image as PILImage
            img = PILImage.open(BytesIO(logo_bytes))
            img_w, img_h = img.size
            if img_w > 0 and img_h > 0:
                aspect = img_h / float(img_w)
                max_w = 4.2 * cm
                max_h = 1.6 * cm
                target_w = max_w
                target_h = target_w * aspect
                if target_h > max_h:
                    target_h = max_h
                    target_w = target_h / aspect
                logo_d = RLImage(BytesIO(logo_bytes), width=target_w, height=target_h)
        except Exception:
            logo_d = None
    if not logo_d:
        logo_d = Spacer(4.2 * cm, 1.2 * cm)

    p_title = Paragraph(f"<b><font size='18' color='#1d4ed8'>{company_name.upper()}</font></b>", ParagraphStyle('mtr_hdr_title', parent=styles['Normal'], fontName='Helvetica-Bold', leading=20))
    gst_text = f"GST NO – {gst_no}" if gst_no else ""
    p_gst = Paragraph(f"<b><font size='9' color='#1d4ed8'>{gst_text}</font></b>", ParagraphStyle('mtr_hdr_gst', parent=styles['Normal'], fontName='Helvetica-Bold', alignment=2, leading=14))

    t_hdr = Table([[logo_d, p_title, p_gst]], colWidths=[4.2 * cm, 8.8 * cm, 5.6 * cm])
    t_hdr.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))

    t_div = Table([[""]], colWidths=[18.6 * cm])
    t_div.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, -1), 1.5, colors.HexColor('#1d4ed8')),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))

    story.extend([t_hdr, Spacer(1, 0.1 * cm), t_div, Spacer(1, 0.4 * cm)])

    STYLE_BOLD_SERIF = ParagraphStyle('mtr_bold', parent=styles['Normal'], fontSize=10, fontName='Helvetica-Bold', textColor=colors.HexColor('#000000'), leading=14)
    STYLE_BODY = ParagraphStyle('mtr_body', parent=styles['Normal'], fontSize=10, fontName='Helvetica', textColor=colors.HexColor('#000000'), leading=14.5, alignment=4, spaceAfter=8)

    city_line = f"MSEDCL Meter Lab {city}." if city else "MSEDCL Meter Lab."
    to_text_parts = ["<b>To,</b>", "<b>Additional Executive Engineer</b>", f"<b>{city_line}</b>"]
    if pincode:
        to_text_parts.append(f"<b>{pincode}</b>")
    to_text = "<br/>".join(to_text_parts)
    story.append(Paragraph(to_text, STYLE_BOLD_SERIF))
    story.append(Spacer(1, 0.3 * cm))

    story.append(Paragraph("<b>Sub: Request for Gen-meter Letter.</b>", STYLE_BOLD_SERIF))
    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph("Dear Sir,", STYLE_BODY))
    story.append(Spacer(1, 0.1 * cm))

    p1 = "I hope this letter finds you well. I am writing to request meter testing services for my solar photovoltaic (PV) system. As a responsible solar PV system owner, I understand the importance of accurate and reliable meter readings to ensure the system's optimal performance and compliance with regulatory standards."
    story.append(Paragraph(p1, STYLE_BODY))

    p2 = f"<b>Customer Name:</b> <u>{client_name}</u> <b>C NO.</b> <u>{consumer_num}</u> I currently have a solar PV system installed at the following <b>location:</b> {location_str}"
    story.append(Paragraph(p2, STYLE_BODY))

    p3 = "To ensure the system's efficiency and adherence to industry standards, I am seeking a comprehensive meter testing service for the following meters within the system:"
    story.append(Paragraph(p3, STYLE_BODY))

    meter_rows = [
        [
            Paragraph(f"<b>Generation Meter - Make-</b> {gen_make}", STYLE_BODY),
            Paragraph(f"<b>SERIAL NO-</b> {gen_serial}", STYLE_BODY),
        ],
        [
            Paragraph(f"<b>NET METER – MAKE -</b> {net_make}", STYLE_BODY),
            Paragraph(f"<b>SERIAL NO -</b> {net_serial}", STYLE_BODY),
        ]
    ]
    t_meters = Table(meter_rows, colWidths=[9.3 * cm, 9.3 * cm])
    t_meters.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    story.append(t_meters)
    story.append(Spacer(1, 0.3 * cm))

    p4 = "I kindly request that the meter testing service be conducted by a certified and accredited organization, ensuring accurate and unbiased results. The testing should include a thorough assessment of the meters' functionality, calibration, and accuracy, as well as verification of their compliance with relevant industry standards and regulations."
    story.append(Paragraph(p4, STYLE_BODY))

    p5 = "Thank you for your attention to this matter. I look forward to receiving your response and arranging the necessary meter testing for my solar PV system."
    story.append(Paragraph(p5, STYLE_BODY))
    story.append(Spacer(1, 0.4 * cm))

    story.append(Paragraph("Thanks & Regards,", STYLE_BODY))
    story.append(Spacer(1, 0.6 * cm))
    story.append(Paragraph(f"<b>{company_name.upper()}</b>", STYLE_BOLD_SERIF))
    story.append(Spacer(1, 0.8 * cm))

    encl_text = "<b>Encl:</b><br/>1. Gen-meter<br/>2. Test report of meter<br/>3. Electricity Bill<br/>4. Solar PV System Approval Latter Copy."
    story.append(Paragraph(encl_text, STYLE_BODY))

    canvas_cls = make_meter_testing_canvas(company)
    pdf.build(story, canvasmaker=canvas_cls)
    return buf.getvalue()


def generate(doc_type: str, client: dict, company: dict) -> bytes:
    doc_type_clean = (doc_type or "").lower().strip()
    if doc_type_clean == "wcr":
        return generate_wcr_pdf(client, company)
    if doc_type_clean == "sldr":
        return generate_sldr_pdf(client, company)
    if doc_type_clean == "net_meter_agreement":
        return generate_net_meter_agreement_pdf(client, company)
    if doc_type_clean in ("vendor_agreement", "vendor"):
        return generate_vendor_agreement_pdf(client, company)
    if doc_type_clean in ("meter_testing_request", "meter_testing"):
        return generate_meter_testing_request_pdf(client, company)
    if doc_type_clean == "annexure":
        try:
            import annexure_generator
            pdf_bytes, content_type = annexure_generator.generate_annexure(client, company)
            return pdf_bytes
        except Exception as _e:
            import logging as _logging
            _logging.getLogger(__name__).error(f"DOCX-based Annexure generation failed, using ReportLab fallback: {_e}")

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
    story.append(Paragraph(f"Document No.: <b>{doc_type_clean.upper()}</b> &nbsp;&nbsp; Date: <b>{datetime.now(timezone.utc).strftime('%d %b %Y')}</b>", SMALL))
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
