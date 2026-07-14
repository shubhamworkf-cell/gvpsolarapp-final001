"""PDF generators for Solarix documents."""
from io import BytesIO
from datetime import datetime, timezone
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image as RLImage

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
            
        rows = [headers]
        for idx, row in enumerate(items, 1):
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


def generate(doc_type: str, client: dict, company: dict) -> bytes:
    buf = BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.5*cm, rightMargin=1.5*cm, topMargin=1.5*cm, bottomMargin=1.5*cm)
    story: list = _header(company)

    title_map = {
        "annexure": "ANNEXURE — Material & Site Details",
        "wcr": "WORK COMPLETION REPORT (WCR)",
        "sldr": "SINGLE LINE DIAGRAM REPORT (SLDR)",
        "net_meter_agreement": "NET METER AGREEMENT",
    }
    story.append(Paragraph(title_map.get(doc_type, doc_type.upper()), H2))
    story.append(Paragraph(f"Document No.: <b>{client.get('sol_id','SOL-')}-{doc_type.upper()}</b> &nbsp;&nbsp; Date: <b>{datetime.now(timezone.utc).strftime('%d %b %Y')}</b>", SMALL))
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

    if doc_type == "annexure":
        story.append(Paragraph("Material Annexure", H2))
        story.append(Paragraph(
            "This annexure certifies that the following materials have been used in the installation as per the agreed BOM. "
            "Quantities and serial numbers reflect the field verification report.", BODY,
        ))
    elif doc_type == "wcr":
        story.append(Paragraph("Declaration of Work Completion", H2))
        story.append(Paragraph(
            f"This is to certify that the rooftop solar PV system of capacity <b>{client.get('system_kw',0)} kW</b> "
            f"has been installed, tested, and commissioned at the client's premises in accordance with all applicable "
            f"DISCOM and MNRE standards. All site verification photos and serial numbers have been documented digitally.",
            BODY,
        ))
    elif doc_type == "sldr":
        story.append(Paragraph("Single Line Diagram Summary", H2))
        story.append(Paragraph(
            "DC side: Solar panels → DCDB (with surge arrester & DC isolator) → Inverter MPPT input. "
            "AC side: Inverter AC output → ACDB (with MCB + RCBO) → Net Meter → DISCOM grid. "
            "Earthing: Separate earth pits for AC, DC and lightning arrester as per IS 3043.",
            BODY,
        ))
    elif doc_type == "net_meter_agreement":
        story.append(Paragraph("Net Metering Agreement Terms", H2))
        story.append(Paragraph(
            "1. The consumer agrees to install a bi-directional net meter at their premises.<br/>"
            "2. Excess generation will be credited as per the prevailing DISCOM tariff.<br/>"
            "3. Annual settlement will be carried out by the DISCOM as per state regulations.<br/>"
            "4. The system will comply with all CEA technical standards for grid connectivity.",
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
