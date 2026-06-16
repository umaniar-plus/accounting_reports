import base64
import io
import xlsxwriter
# import re
from datetime import datetime
from odoo import models, api

import logging
_logger = logging.getLogger(__name__)


class agedPayableExport(models.TransientModel):
    _name = 'aged.payable.export'
    _description = 'aged payable Export'

    def format_currency_helper(self, amount, currency_symbol, precision=2):
        if currency_symbol and currency_symbol != 'False':
            return f"{currency_symbol} {amount:,.{precision}f}"
        return f"{amount:,.{precision}f}"

    def format_indian_number(self, amount):

        try:
            amount = float(amount)

            integer, decimal = f"{amount:.2f}".split(".")

            if len(integer) <= 3:
                return f"{integer}.{decimal}"

            last3 = integer[-3:]

            remaining = integer[:-3]

            parts = []

            while len(remaining) > 2:
                parts.insert(0, remaining[-2:])
                remaining = remaining[:-2]

            if remaining:
                parts.insert(0, remaining)

            return f"{','.join(parts)},{last3}.{decimal}"

        except Exception:
            return str(amount)

    def _generate_ap_filename(self, data, file_ext="pdf"):
        as_of_date = data.get('as_of_date')

        if as_of_date:
            filename_core = datetime.strptime(
                as_of_date,
                "%Y-%m-%d"
            ).strftime("%d%m%Y")
        else:
            filename_core = datetime.now().strftime("%Y%m%d_%H%M%S")

        return f"aged_payable_{filename_core}.{file_ext}"


    def get_period_text(self, data):
        as_of_date = data.get('as_of_date')

        if as_of_date:
            return f"As Of Date: {as_of_date}"

        return "As Of Date: All"

    

    @api.model
    def export_aged_payable_pdf(self, data):

        collapsed_partners = data.get('collapsed_partners', {})

        for account in data.get('grouped_data', []):

            partner_name = account.get('partner_name')

            if collapsed_partners.get(partner_name, False):
            
                account['lines'] = []

        """Export aged payable to PDF using Odoo QWeb template"""

        if 'grouped_data' in data and isinstance(data['grouped_data'], dict):
            data['grouped_data'] = list(data['grouped_data'].values())

        if 'column_config' not in data:
            config = self.env['aged.payable.report.config'].get_active_config()
            data['column_config'] = config

        if not data.get('bucket_headers'):
            data['bucket_headers'] = self.get_bucket_headers(
                data.get('period_length', 30)
            )
        
        data['format_currency'] = self.format_currency_helper

        filename = self._generate_ap_filename(data, file_ext="pdf")

        try:
            report_ref = 'aged_payable_report.aged_payable_pdf_export'
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
                report_ref = 'aged_payable_report.aged_payable_pdf_export'
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
                    'report_name': 'aged_payable_report.aged_payable_pdf_export',
                    'data': {'data': data},
                    'report_type': 'qweb-pdf'
                }

    @api.model
    def export_aged_payable_xlsx(self, data):
        data['format_currency'] = self.format_currency_helper
        collapsed_partners = data.get('collapsed_partners', {})
        try:
            output = io.BytesIO()
            workbook = xlsxwriter.Workbook(output, {'in_memory': True})
            worksheet = workbook.add_worksheet('aged payable')

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

            invoice_format = workbook.add_format({
                'border': 1,
                'align': 'left',
                'valign': 'top',
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
            grand_total_label_format = workbook.add_format({
                'bold': True,
                'bg_color': '#D9EAD3',
                'border': 1,
                'align': 'center',
                'valign': 'vcenter'
            })
            grand_total_number_format = workbook.add_format({
                'bold': True,
                'bg_color': '#D9EAD3',
                'border': 1,
                'align': 'right',
                'valign': 'vcenter'
            })
            

            # Set column widths
            worksheet.set_column('A:A', 40)  # Invoice
            worksheet.set_column('B:B', 15)  # Invoice Date
            worksheet.set_column('C:C', 15)  # At Date
            worksheet.set_column('D:D', 15)
            worksheet.set_column('E:E', 15)
            worksheet.set_column('F:F', 15)
            worksheet.set_column('G:G', 15)
            worksheet.set_column('H:H', 15)
            worksheet.set_column('I:I', 15)  # Balance

            period_text = self.get_period_text(data)

            # Title & filter info
            worksheet.merge_range('A1:I1', 'aged payable Report', title_format)
            worksheet.merge_range(
                'A2:I2',
                period_text,
                workbook.add_format({'align': 'center', 'font_size': 12, 'italic': True})
            )

            # Add some spacing
            worksheet.set_row(2, 5)  # Empty row with reduced height

            if not data.get('bucket_headers'):
                data['bucket_headers'] = self.get_bucket_headers(
                    data.get('period_length', 30)
                )

            # Headers
            headers = ['Invoice', 'Invoice Date', 'At Date', data['bucket_headers'][0],data['bucket_headers'][1],data['bucket_headers'][2],data['bucket_headers'][3],'Older','Total']
            for col, header in enumerate(headers):
                worksheet.write(4, col, header, header_format)

            # Ledger data
            row = 5
            grouped_data = data.get('grouped_data', [])
            
            _logger.warning("GROUPED DATA = %s", grouped_data)

            for partner in grouped_data:

                partner_name = partner.get('partner_name', 'Unknown Partner')

                worksheet.merge_range(
                    row, 0, row, 8,
                    f"Partner: {partner_name}",
                    account_format
                )

                row += 1
                
                partner_name = partner.get(
                    'partner_name'
                )

                if collapsed_partners.get(
                    partner_name,
                    False
                ):
                
                    worksheet.merge_range(
                        row, 0, row, 1,
                        f"Total {partner_name}",
                        workbook.add_format({
                            'bold': True,
                            'border': 1
                        })
                    )

                    worksheet.write(
                        row, 2,
                        self.format_indian_number(partner.get('at_date', 0)),
                        number_format
                    )
                    
                    worksheet.write(
                        row, 3,
                        self.format_indian_number(partner.get('bucket_1', 0)),
                        number_format
                    )
                    
                    worksheet.write(
                        row, 4,
                        self.format_indian_number(partner.get('bucket_2', 0)),
                        number_format
                    )
                    
                    worksheet.write(
                        row, 5,
                        self.format_indian_number(partner.get('bucket_3', 0)),
                        number_format
                    )
                    
                    worksheet.write(
                        row, 6,
                        self.format_indian_number(partner.get('bucket_4', 0)),
                        number_format
                    )
                    
                    worksheet.write(
                        row, 7,
                        self.format_indian_number(partner.get('older', 0)),
                        number_format
                    )
                    
                    worksheet.write(
                        row, 8,
                        self.format_indian_number(partner.get('total', 0)),
                        number_format
                    )

                    row += 2

                    continue

                subtotal_at_date = 0
                subtotal_bucket_1 = 0
                subtotal_bucket_2 = 0
                subtotal_bucket_3 = 0
                subtotal_bucket_4 = 0
                subtotal_older = 0
                subtotal_total = 0

                for line in partner.get('lines', []):
                
                    
                    journal_text = line.get('move_name', '')

                    if line.get('name') and line.get('name') != line.get('move_name'):
                        journal_text += f"\n{line.get('name')}"
                    
                    # max_invoice_length = max(max_invoice_length, len(journal_text))
                    
                    max_invoice_length = len("Invoice")

                    worksheet.write(row, 0, journal_text, invoice_format)
                    line_count = journal_text.count('\n') + 1

                    worksheet.set_row(
                        row,
                        max(25, line_count * 18)
                    )

                    worksheet.write(row,1,line.get('invoice_date', ''),text_format)

                    worksheet.write(row,2,self.format_indian_number(line.get('at_date', 0)),number_format)

                    worksheet.write(row,3,self.format_indian_number(line.get('bucket_1', 0)),number_format)

                    worksheet.write(row,4,self.format_indian_number(line.get('bucket_2', 0)),number_format)

                    worksheet.write(row,5,self.format_indian_number(line.get('bucket_3', 0)),number_format)

                    worksheet.write(row,6,self.format_indian_number(line.get('bucket_4', 0)),number_format)

                    worksheet.write(row,7,self.format_indian_number(line.get('older', 0)),number_format)

                    worksheet.write(row,8,self.format_indian_number(line.get('total', 0)),number_format)


                    subtotal_at_date += line.get('at_date', 0)

                    subtotal_bucket_1 += self.format_indian_number(line.get('bucket_1', 0))

                    subtotal_bucket_2 += self.format_indian_number(line.get('bucket_2', 0))

                    subtotal_bucket_3 += self.format_indian_number(line.get('bucket_3', 0))

                    subtotal_bucket_4 += self.format_indian_number(line.get('bucket_4', 0))

                    subtotal_older += self.format_indian_number(line.get('older', 0))

                    subtotal_total += self.format_indian_number(line.get('total', 0))

                    row += 1

                worksheet.write(row, 0, f"Total {partner_name}", account_format)

                worksheet.write(row, 1, "", account_format)

                worksheet.write(row, 2, self.format_indian_number(subtotal_at_date), number_format)

                worksheet.write(row, 3, self.format_indian_number(subtotal_bucket_1), number_format)

                worksheet.write(row, 4, self.format_indian_number(subtotal_bucket_2), number_format)

                worksheet.write(row, 5, self.format_indian_number(subtotal_bucket_3), number_format)

                worksheet.write(row, 6, self.format_indian_number(subtotal_bucket_4), number_format)

                worksheet.write(row, 7, self.format_indian_number(subtotal_older), number_format)

                worksheet.write(row, 8, self.format_indian_number(subtotal_total), number_format)

                row += 2

            totals = data.get('totals', {})
            worksheet.merge_range(row, 0, row, 1, "TOTAL", grand_total_label_format)
            worksheet.write(row, 2, self.format_indian_number(totals.get('at_date', 0)), grand_total_number_format)
            worksheet.write(row, 3, self.format_indian_number(totals.get('bucket_1', 0)), grand_total_number_format)
            worksheet.write(row, 4, self.format_indian_number(totals.get('bucket_2', 0)), grand_total_number_format)
            worksheet.write(row, 5, self.format_indian_number(totals.get('bucket_3', 0)), grand_total_number_format)
            worksheet.write(row, 6, self.format_indian_number(totals.get('bucket_4', 0)), grand_total_number_format)
            worksheet.write(row, 7, self.format_indian_number(totals.get('older', 0)), grand_total_number_format)
            worksheet.write(row, 8, self.format_indian_number(totals.get('total', 0)), grand_total_number_format)

            
            workbook.close()
            output.seek(0)
            # filename = f"aged_payable_{data.get('filter_title', 'Report')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            filename = self._generate_ap_filename(data, file_ext="xlsx")

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

            _logger.error(f"Error exporting aged payable to XLSX: {str(e)}")

            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'message': f'Error exporting to Excel: {str(e)}',
                    'type': 'danger',
                    'sticky': False,
                }
            }


    def get_bucket_headers(self, period_length):
        return [
            f"1-{period_length}",
            f"{period_length + 1}-{period_length * 2}",
            f"{period_length * 2 + 1}-{period_length * 3}",
            f"{period_length * 3 + 1}-{period_length * 4}",
        ]
