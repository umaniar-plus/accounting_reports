from odoo import api, models


class AgedReceivableReport(models.AbstractModel):
    _name = "aged.receivable.report"
    _description = "Aged Receivable Report Logic"

    @api.model
    def get_aged_receivable_data(
        self,
        as_of_date,
        period_length=30,
        aging_basis='due_date',
        search_text=''
    ):

        domain = [
            ('move_id.state', '=', 'posted'),
            ('partner_id', '!=', False),
            ('account_id.account_type', '=', 'asset_receivable'),
            ('amount_residual', '!=', 0),
            ('date', '<=', as_of_date),
        ]

        # if search_text:

        #     search_domain = [
        #         '|',
        #         '|',
        #         '|',
        
        #         ('move_name', 'ilike', search_text),
        
        #         ('partner_id.name', 'ilike', search_text),
        
        #         ('name', 'ilike', search_text),
        
        #         ('balance', '=', float(search_text))
        #             if search_text.replace('.', '', 1).isdigit()
        
        #             else ('id', '!=', 0),
        #     ]
        
            # domain += search_domain

        lines = self.env['account.move.line'].search(
        
            domain,

            order='date asc, move_name asc, id asc'

        )

        result = []

        for line in lines:

            outstanding = abs(line.amount_residual)

            if abs(line.amount_residual) <= 0:
                continue

            result.append({
                'id': line.id,
                'move_name': line.move_name,
                'move_id': [line.move_id.id, line.move_id.display_name],
                'date': str(line.date),
                'date_maturity': str(line.date_maturity) if line.date_maturity else False,
                'partner_id': [line.partner_id.id, line.partner_id.name],
                'account_id': [line.account_id.id, line.account_id.display_name],
                'balance': outstanding,
                'amount_residual': line.amount_residual,
                'reconciled': line.reconciled,
                'name': line.name or '',
            })
        if search_text:

            text = search_text.lower().strip()
        
            filtered = []
        
            for line in result:
            
                partner_name = ''
        
                if line.get('partner_id'):
                
                    partner_name = line['partner_id'][1]
        
                move_name = line.get('move_name', '')
        
                description = line.get('name', '')
        
                amount = str(
                    line.get(
                        'amount_residual',
                        0
                    )
                )
        
                if (
                
                    text in partner_name.lower()
        
                    or
        
                    text in move_name.lower()
        
                    or
        
                    text in description.lower()
        
                    or
        
                    text in amount
        
                ):
        
                    filtered.append(line)
        
            result = filtered

        return result
