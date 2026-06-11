import base64
import io
import xlsxwriter
# import re
from datetime import datetime
from odoo import models, api

import logging
_logger = logging.getLogger(__name__)


class partnerLedgerExport(models.TransientModel):
    _name = 'partner.ledger.export'
    _description = 'partner Ledger Export'

    def format_currency_helper(self, amount, currency_symbol='₹', precision=2):

        try:
            amount = float(amount or 0)
        except Exception:
            amount = 0.0

        formatted = f"{amount:.{precision}f}"

        if "." in formatted:
            int_part, dec_part = formatted.split(".")
        else:
            int_part, dec_part = formatted, ""

        sign = ""
        if int_part.startswith("-"):
            sign = "-"
            int_part = int_part[1:]

        if len(int_part) > 3:
            last_three = int_part[-3:]
            other = int_part[:-3]

            groups = []
            while len(other) > 2:
                groups.insert(0, other[-2:])
                other = other[:-2]

            if other:
                groups.insert(0, other)

            int_part = ",".join(groups) + "," + last_three

        result = sign + int_part

        if precision:
            result += "." + dec_part

        if currency_symbol and currency_symbol != "False":
            return f"{currency_symbol} {result}"

        return result

    def _generate_pl_filename(self, data, file_ext="pdf"):
        _logger.info(f"Called filename function for {file_ext}")
        start_date = data.get('date_from')
        end_date = data.get('date_to')
        month = data.get('month')
        quarter = data.get('quarter')
        year = data.get('year')

        search_text = data.get('search_text', '').strip()
        search_prefix = ""
        if search_text:
            sanitized_text = search_text.replace(' ', '_').replace('/', '_').replace('\\', '_')
            search_prefix = f"{sanitized_text}_"

        _logger.info(start_date)
        _logger.info(end_date)
        _logger.info(quarter)
        _logger.info(month)
        _logger.info(year)

        filename_core = ""

        # Month + Year
        if month and year:
            date_obj = datetime(int(year), int(month), 1)
            filename_core = date_obj.strftime('%b_%Y')

        # Quarter + Year
        elif quarter and year:
            quarter_map = {
                "q1": "Jan_Mar",
                "q2": "Apr_Jun",
                "q3": "Jul_Sep",
                "q4": "Oct_Dec"
            }
            quarter_range = quarter_map.get(quarter.lower(), quarter.lower())
            filename_core = f"{quarter_range}_{year}"

        # Only Year
        elif year and not month and not quarter:
            filename_core = f"{year}"

        # Date range
        elif start_date and end_date:
            start_str = datetime.strptime(start_date, "%Y-%m-%d").strftime("%d%m%Y")
            end_str = datetime.strptime(end_date, "%Y-%m-%d").strftime("%d%m%Y")
            filename_core = f"{start_str}_{end_str}"

        # Default (timestamp)
        else:
            filename_core = datetime.now().strftime('%Y%m%d_%H%M%S')

        filename = f"partner_ledger_{search_prefix}{filename_core}.{file_ext}"

        filename = filename.replace('__', '_')

        _logger.info(filename)
        return filename


    def get_period_text(self, data):
        date_from = data.get("date_from")
        date_to = data.get("date_to")

        if date_from and date_to:
            try:
                from_str = datetime.strptime(date_from, "%Y-%m-%d").strftime("%d %b %Y")
                to_str = datetime.strptime(date_to, "%Y-%m-%d").strftime("%d %b %Y")
                _logger.info(f"Period: From {from_str} To {to_str}")
                return f"Period: From {from_str} To {to_str}"
            except Exception as e:
                _logger.error(f"Error generating Period Text: {str(e)}")

        # Fallback if dates are missing or parsing fails
        return f"Period: {data.get('filter_title', 'All Records')}"

    @api.model
    def export_partner_ledger_pdf(self, data):
        """Export partner Ledger to PDF using Odoo QWeb template"""

        if 'grouped_data' in data and isinstance(data['grouped_data'], dict):
            data['grouped_data'] = list(data['grouped_data'].values())

        if 'column_config' not in data:
            config = self.env['partner.ledger.report.config'].get_active_config()
            data['column_config'] = config

        data['format_currency'] = self.format_currency_helper

        collapsed_partners = data.get('collapsed_partners', {})

        for partner in data.get('grouped_data', []):
        
            partner_name = partner.get('partner_name')

            if collapsed_partners.get(partner_name, False):
                partner['lines'] = []

        filename = self._generate_pl_filename(data, file_ext="pdf")

        try:
            report_ref = 'partner_ledger_report.partner_ledger_pdf_export'
            report = self.env.ref(report_ref)

            pdf_content, _ = report._render_qweb_pdf(res_ids=[], data={'data': data})

            attachment = self.env['ir.attachment'].create({
                'name': filename,
                'type': 'binary',
                'datas': base64.b64encode(pdf_content),
                'store_fname': filename,
                'mimetype': 'application/pdf',
            })
            return {
                'type': 'ir.actions.act_url',
                'url': f'/web/content/{attachment.id}?download=true',
                'target': 'self'
            }
        except Exception as e:
            # Alternative approach if the above doesn't work
            try:
                report_ref = 'partner_ledger_report.partner_ledger_pdf_export'
                report = self.env.ref(report_ref)

                # Alternative method call for Odoo 18
                pdf_content, _ = report._render_qweb_pdf(report_ref, data={'data': data})

                attachment = self.env['ir.attachment'].create({
                    'name': filename,
                    'type': 'binary',
                    'datas': base64.b64encode(pdf_content),
                    'store_fname': filename,
                    'mimetype': 'application/pdf',
                })
                return {
                    'type': 'ir.actions.act_url',
                    'url': f'/web/content/{attachment.id}?download=true',
                    'target': 'self'
                }
            except Exception as e2:
                return {
                    'type': 'ir.actions.report',
                    'report_name': 'partner_ledger_report.partner_ledger_pdf_export',
                    'data': {'data': data},
                    'report_type': 'qweb-pdf'
                }

    @api.model
    def export_partner_ledger_xlsx(self, data):
        data['format_currency'] = self.format_currency_helper
        try:
            output = io.BytesIO()
            workbook = xlsxwriter.Workbook(output, {'in_memory': True})
            worksheet = workbook.add_worksheet('Partner Ledger')

            # Enhanced formatting
            header_format = workbook.add_format({
                'bold': True,
                'bg_color': '#D3D3D3',
                'border': 1,
                'align': 'center',
                'valign': 'vcenter',
                'font_size': 11
            })
            number_format = workbook.add_format({
                'num_format': '#,##0.00',
                'border': 1,
                'align': 'right',
                'valign': 'vcenter'
            })
            text_format = workbook.add_format({
                'border': 1,
                'align': 'left',
                'valign': 'vcenter',
                'text_wrap': True
            })
            title_format = workbook.add_format({
                'bold': True,
                'align': 'center',
                'font_size': 16,
                'bg_color': '#4F81BD',
                'font_color': 'white'
            })
            account_format = workbook.add_format({
                'bold': True,
                'bg_color': '#F0F8FF',
                'border': 1,
                'align': 'left',
                'valign': 'vcenter'
            })

            # Set column widths
            worksheet.set_column('A:A', 40)  # Journal
            worksheet.set_column('B:B', 12)  # Date
            worksheet.set_column('C:C', 12)  # Due Date
            worksheet.set_column('D:D', 20)  # Transaction Amount Currency
            worksheet.set_column('E:E', 10)  # Currency
            worksheet.set_column('F:F', 15)  # Debit
            worksheet.set_column('G:G', 15)  # Credit
            worksheet.set_column('H:H', 15)  # Balance

            period_text = self.get_period_text(data)

            # Title & filter info
            worksheet.merge_range('A1:H1', 'Partner Ledger Report', title_format)
            worksheet.merge_range(
                'A2:H2',
                period_text,
                workbook.add_format({'align': 'center', 'font_size': 12, 'italic': True})
            )

            # Add some spacing
            worksheet.set_row(2, 5)  # Empty row with reduced height

            # Headers
            headers = ['Journal', 'Date', 'Due Date', 'Transaction Amount Currency', 'Currency', 'Debit', 'Credit', 'Balance']
            for col, header in enumerate(headers):
                worksheet.write(4, col, header, header_format)

            # Ledger data
            row = 5
            grouped_data = data.get('grouped_data', {})
            grouped_data = data.get('grouped_data', [])
            collapsed_partners = data.get('collapsed_partners', {})
            

            for partner in grouped_data:

                partner_name = partner.get('partner_name', 'Unknown Partner')

                if collapsed_partners.get(partner_name, False):

                    worksheet.merge_range(
                        row, 0, row, 4,
                        f"Total {partner_name}",
                        workbook.add_format({
                            'bold': True,
                            'border': 1
                        })
                    )
                
                    worksheet.write(
                        row, 5,
                        partner.get('debit', 0),
                        workbook.add_format({
                            'num_format': '#,##0.00',
                            'bold': True,
                            'border': 1
                        })
                    )
                
                    worksheet.write(
                        row, 6,
                        partner.get('credit', 0),
                        workbook.add_format({
                            'num_format': '#,##0.00',
                            'bold': True,
                            'border': 1
                        })
                    )
                
                    worksheet.write(
                        row, 7,
                        partner.get('balance', 0),
                        workbook.add_format({
                            'num_format': '#,##0.00',
                            'bold': True,
                            'border': 1
                        })
                    )
                
                    row += 2
                    continue

                worksheet.merge_range(
                    row, 0, row, 7,
                    f"Partner: {partner_name}",
                    account_format
                )

                row += 1

                subtotal_debit = 0
                subtotal_credit = 0
                subtotal_balance = 0
                
                running_balance = 0

                for line in partner.get('lines', []):
                
                    debit = line.get('debit', 0)
                    credit = line.get('credit', 0)
                
                    if line.get('initial_balance'):
                        balance = line.get('balance', 0)
                        running_balance = balance
                    else:
                        running_balance += debit - credit
                        balance = running_balance
                
                    if (
                        debit == 0 and
                        credit == 0 and
                        balance == 0 and
                        line.get('move_name') != 'Initial Balance'
                        
                    ):
                        continue
                    
                    journal_text = line.get('move_name', '')

                    if line.get('name') and line.get('name') != line.get('move_name'):
                        journal_text += f"\n{line.get('name')}"

                    worksheet.write(row, 0, journal_text, text_format)
                    if journal_text and len(str(journal_text)) > 80:
                        worksheet.set_row(row, 50)
                    elif journal_text and len(str(journal_text)) > 40:
                        worksheet.set_row(row, 40)
                    else:
                        worksheet.set_row(row, 30)

                    worksheet.write(row,1,datetime.strptime(str(line.get('date')),"%Y-%m-%d").strftime("%d/%m/%Y") if line.get('date') else '',text_format) 
                    worksheet.write(row,2,datetime.strptime(str(line.get('date_maturity')),"%Y-%m-%d").strftime("%d/%m/%Y") if line.get('date_maturity') else '',text_format)
                    
                    amount_currency = line.get('amount_currency', 0)
                    currency_symbol = line.get('currency_symbol', '')
                    worksheet.write(row, 3,f"{currency_symbol} {amount_currency:,.2f}",text_format)
                    worksheet.write(row,4,line.get('currency_id')[1] if line.get('currency_id') else '',text_format)

                    

                    worksheet.write(row, 5, debit, number_format)
                    worksheet.write(row, 6, credit, number_format)
                    worksheet.write(row, 7, balance, number_format)

                    subtotal_debit += debit
                    subtotal_credit += credit
                    

                    row += 1

                    subtotal_balance = running_balance

                worksheet.merge_range(
                    row, 0, row, 4,
                    f"Total {partner_name}",
                    workbook.add_format({
                        'bold': True,
                        'border': 1
                    })
                )

                worksheet.write(
                    row, 5, subtotal_debit,
                    workbook.add_format({
                        'num_format': '#,##0.00',
                        'bold': True,
                        'border': 1
                    })
                )

                worksheet.write(
                    row, 6, subtotal_credit,
                    workbook.add_format({
                        'num_format': '#,##0.00',
                        'bold': True,
                        'border': 1
                    })
                )

                worksheet.write(
                    row, 7, subtotal_balance,
                    workbook.add_format({
                        'num_format': '#,##0.00',
                        'bold': True,
                        'border': 1
                    })
                )

                row += 2

            # Add summary at the end
            if grouped_data:
                total_debit = sum(partner.get('debit', 0) for partner in grouped_data)
                total_credit = sum(partner.get('credit', 0) for partner in grouped_data)
                total_balance = sum(partner.get('balance', 0) for partner in grouped_data)

                worksheet.merge_range(row, 0, row, 4, 'TOTAL',
                                      workbook.add_format(
                                          {'bold': True, 'bg_color': '#4F81BD', 'font_color': 'white', 'border': 1}))
                worksheet.write(row, 5, total_debit,
                                workbook.add_format({'num_format': '#,##0.00', 'bold': True, 'bg_color': '#4F81BD',
                                                     'font_color': 'white', 'border': 1}))
                worksheet.write(row, 6, total_credit,
                                workbook.add_format({'num_format': '#,##0.00', 'bold': True, 'bg_color': '#4F81BD',
                                                     'font_color': 'white', 'border': 1}))
                worksheet.write(row, 7, total_balance,
                                workbook.add_format({'num_format': '#,##0.00', 'bold': True, 'bg_color': '#4F81BD',
                                                     'font_color': 'white', 'border': 1}))
            
            workbook.close()
            output.seek(0)

            # filename = f"partner_Ledger_{data.get('filter_title', 'Report')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            filename = self._generate_pl_filename(data, file_ext="xlsx")

            attachment = self.env['ir.attachment'].create({
                'name': filename,
                'type': 'binary',
                'datas': base64.b64encode(output.read()),
                'store_fname': filename,
                'mimetype': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            })
            return {
                'type': 'ir.actions.act_url',
                'url': f'/web/content/{attachment.id}?download=true',
                'target': 'self'
            }

        except Exception as e:
            # Log the error and return user-friendly message

            _logger.error(f"Error exporting Partner Ledger to XLSX: {str(e)}")

            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'message': f'Error exporting to Excel: {str(e)}',
                    'type': 'danger',
                    'sticky': False,
                }
            }
