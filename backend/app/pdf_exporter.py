import io
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

def export_chat_history_to_pdf(chat_title: str, username: str, history_data: list) -> bytes:
    """Compile chat log into a production-grade PDF document in memory."""
    buffer = io.BytesIO()
    
    # Page setup
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=54,
        leftMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    
    styles = getSampleStyleSheet()
    
    # Custom Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=colors.HexColor('#1A1A1A'),
        spaceAfter=6
    )
    
    meta_style = ParagraphStyle(
        'DocMeta',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#666666'),
        spaceAfter=20
    )
    
    user_header_style = ParagraphStyle(
        'UserHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#2E7D32'), # Soft Green
        spaceAfter=4
    )
    
    ai_header_style = ParagraphStyle(
        'AIHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#1565C0'), # Soft Blue
        spaceAfter=4
    )
    
    msg_body_style = ParagraphStyle(
        'MsgBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#333333'),
    )

    story = []
    
    # Document Header
    story.append(Paragraph("Talk-to-Data Transcript", title_style))
    date_str = datetime.now().strftime("%B %d, %Y - %I:%M %p")
    story.append(Paragraph(f"<b>Session Title:</b> {chat_title}<br/><b>User:</b> {username}<br/><b>Exported At:</b> {date_str}", meta_style))
    story.append(Spacer(1, 10))
    
    # Chat History
    for idx, msg in enumerate(history_data):
        role = msg.get("role", "user")
        content = msg.get("content", "")
        
        # Format HTML/markdown linebreaks for ReportLab Paragraphs
        formatted_content = content.replace("\n", "<br/>")
        
        # Format markdown tables inside content by replacing them with plain spacing (or simplified layout)
        # Standard reportlab Paragraph does not support complex HTML tables, so we clean it up slightly
        # We can also clean up markdown bold tags (**text**) into HTML bold tags (<b>text</b>)
        formatted_content = formatted_content.replace("**", "<b>", 1)
        while "**" in formatted_content:
            formatted_content = formatted_content.replace("**", "</b>", 1)
            formatted_content = formatted_content.replace("**", "<b>", 1)
            
        if role == "user":
            header = Paragraph(f"User: {username}", user_header_style)
            body = Paragraph(formatted_content, msg_body_style)
            bg_color = colors.HexColor('#F1F8E9') # Soft green tint
            border_color = colors.HexColor('#C5E1A5')
        else:
            header = Paragraph("AI Agent", ai_header_style)
            body = Paragraph(formatted_content, msg_body_style)
            bg_color = colors.HexColor('#E3F2FD') # Soft blue tint
            border_color = colors.HexColor('#90CAF9')
            
        # Wrap message in a table container for padding and background
        data = [[header], [body]]
        
        # Width of the card container (letter width is 612, margins 54 on each side, so 504 pt printable)
        t = Table(data, colWidths=[504])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), bg_color),
            ('TOPPADDING', (0,0), (-1,-1), 10),
            ('BOTTOMPADDING', (0,0), (-1,-1), 10),
            ('LEFTPADDING', (0,0), (-1,-1), 12),
            ('RIGHTPADDING', (0,0), (-1,-1), 12),
            ('BOX', (0,0), (-1,-1), 1, border_color),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ]))
        
        story.append(KeepTogether([t]))
        story.append(Spacer(1, 12))
        
    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
