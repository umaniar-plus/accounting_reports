from odoo import models, fields, api


class agedReceivableReportConfig(models.Model):
    _name = 'aged.receivable.report.config'
    _description = 'Aged Receivable Report Configuration'
    _rec_name = "name"
    _check_company_auto = True

    name = fields.Char(string="Configuration Name", required=True, default="Default Configuration")
    company_id = fields.Many2one('res.company', string='Company', required=True, default=lambda self: self.env.company)

    # 🆕 Fields for customization (Matching the OWL component's logic)
    show_invoice_date = fields.Boolean(default=True)
    show_invoice = fields.Boolean(default=True)
    show_at_date = fields.Boolean(default=True)
    show_bucket_1 = fields.Boolean(default=True)
    show_bucket_2 = fields.Boolean(default=True)
    show_bucket_3 = fields.Boolean(default=True)
    show_bucket_4 = fields.Boolean(default=True)
    show_older = fields.Boolean(default=True)
    show_total = fields.Boolean(default=True)
    aging_basis = fields.Selection(
    [
        ('invoice_date', 'Invoice Date'),
        ('due_date', 'Due Date')
    ],default='due_date')

    _sql_constraints = [
        ('unique_company_config', 'unique(company_id)',
         'Only one Aged Receivable Configuration is allowed per company.'),
    ]

    # 🆕 Updated method to return all field values
    @api.model
    def get_active_config(self):
        # Search for existing config for the current company, filtered by company_id
        config = self.search([('company_id', '=', self.env.company.id)], limit=1)

        if not config:
            # Create a new one if none exists
            config = self.create({'company_id': self.env.company.id, 'name': 'Default Configuration'})

        # Return the ID and the fields needed by the OWL component
        return {
            'id': config.id,
            'show_invoice': config.show_invoice,
            'show_invoice_date':config.show_invoice_date,
            'show_at_date' :config.show_at_date,
            'show_bucket_1':config.show_bucket_1,
            'show_bucket_2':config.show_bucket_2,
            'show_bucket_3':config.show_bucket_3,
            'show_bucket_4':config.show_bucket_4,
            'show_older':config.show_older,
            'show_total':config.show_total,
        }
