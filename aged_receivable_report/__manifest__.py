{
    'name': 'Aged Receivable Report',
    'version': '19.0.1.0',
    'license': 'LGPL-3',
    'summary': 'Custom Aged Receivable Report',
    'category': 'Accounting',
    'author': 'Areterix Technologies',
    'website': 'https://www.areterix.com/',
    'depends': ['account','web'],
    'data': [
        'security/ir.model.access.csv',

        'data/pdf_paper_format.xml',
        'views/aged_receivable_owl_action.xml',
        'views/aged_receivable_pdf_template.xml',
        'views/aged_receivable_report_config_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'aged_receivable_report/static/src/js/aged_receivable_report_owl.js',
            'aged_receivable_report/static/src/xml/aged_receivable_report.xml',
            'aged_receivable_report/static/src/css/aged_receivable_report.css',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}