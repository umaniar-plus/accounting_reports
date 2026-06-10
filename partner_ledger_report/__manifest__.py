{
    'name': 'Partner Ledger Report',
    'version': '19.0.1.0.0',
    'license': 'LGPL-3',
    'summary': 'Custom Partner Ledger Report',
    'category': 'Accounting',
    'author': 'Areterix Technologies1',
    'website': 'https://www.areterix.com/',
    'depends': ['account', 'web'],
    'data': [
        'security/ir.model.access.csv',

        'data/pdf_paper_format.xml',

        'views/partner_ledger_owl_action.xml',
        'views/partner_ledger_pdf_template.xml',
        'views/partner_ledger_report_config_views.xml',
    ],
    "assets": {
        "web.assets_backend": [
            "partner_ledger_report/static/src/js/partner_ledger_report_owl.js",
            "partner_ledger_report/static/src/xml/partner_ledger_report.xml",
            "partner_ledger_report/static/src/css/partner_ledger_report.css",
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
