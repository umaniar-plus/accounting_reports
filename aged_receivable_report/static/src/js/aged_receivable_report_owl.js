/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Component, useState, onWillStart, onMounted, useRef } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

const configModel = 'aged.receivable.report.config';

export class AgedReceivableReport extends Component {
    setup() {
        this.state = useState({
            ledgerData: [],
            groupedData: [],
            selectedPartners: [],
            availablePartners: [],
            showPartnerDropdown: false,
            collapsedPartners: {},  
            visibleLinesCount: {},
            sortDirection: 'asc',   
            isDebug: Boolean(odoo.debug),

            
            dateFilter: "today",

            selectedMonth: "",
            selectedQuarter: "",
            selectedYear: "",

            months: [
                "January",
                "February",
                "March",
                "April",
                "May",
                "June",
                "July",
                "August",
                "September",
                "October",
                "November",
                "December"
            ],
            
            quarters: [
                "Q1",
                "Q2",
                "Q3",
                "Q4"
            ],
            years: [],
            yearOptions: [],

            asOfDate: "",
            periodLength: 30,
            agingBasis: 'due_date',

            bucketHeaders: [
                '1-30',
                '31-60',
                '61-90',
                '91-120'
            ],

            totals: {
                at_date: 0,
                bucket_1: 0,
                bucket_2: 0,
                bucket_3: 0,
                bucket_4: 0,
                older: 0,
                total: 0
            },

            config: {},
        });

        this.ui = useService("ui");
        this.orm = useService("orm");
        this.dateFromRef = useRef("date-from");
        this.dateToRef = useRef("date-to");
        this.searchInput = useRef("search-input");

        onWillStart(async () => {

            await this.loadConfig();

            await this.loadPartners();

            this.initializeDateFilters();

            this.updateAsOfDateFromFilter();

            this.updateBucketHeaders();

            await this.loadLedgerData();
        });

        onMounted(() => {
            // Set date picker values after DOM is ready
            if (this.state.fyDates) {
                if (this.dateFromRef.el) {
                    this.dateFromRef.el.value = this.state.fyDates.start;
                }
                if (this.dateToRef.el) {
                    this.dateToRef.el.value = this.state.fyDates.end;
                }
            }
            // When page loads again, restores to which accounts were open/closed
            const savedCollapsed =
                localStorage.getItem("aged_receivable_collapsed_accounts");

            if (savedCollapsed) {
                this.state.collapsedPartners =
                    JSON.parse(savedCollapsed);
            }

            const savedScroll =
                localStorage.getItem("aged_receivable_scroll");

            if (savedScroll) {
                setTimeout(() => {
                    requestAnimationFrame(() => {

                        const content =
                            document.querySelector('.o_content');
                        if (content) {
                        
                        content.scrollTop =
                                parseInt(savedScroll);
                        }
            
                    });
            
                }, 500);
            }
            document.addEventListener(

                'click',
            
                this.handleOutsidePartnerClick
            
            );
                    });
                
                    this.action = useService("action");
                }

    sortByDate() {

        // Toggle asc/desc
        this.state.sortDirection =
            this.state.sortDirection === 'asc'
                ? 'desc'
                : 'asc';
    
        // Sort ledger data
        // Sort only lines INSIDE each partner

        this.state.groupedData.forEach(partner => {
        
            partner.lines.sort((a, b) => {
            
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
            
                if (this.state.sortDirection === 'asc') {
                    return dateA - dateB;
                } else {
                    return dateB - dateA;
                }
            });
        
        });
    }


    reloadPage() {
        window.location.reload();
    }

    async loadConfig() {
        
        try {
            const configRecord = await this.orm.call(
                configModel,
                'get_active_config',
                []
            );

            // Assuming configRecord contains fields like show_journal, etc.
            if (configRecord) {
                this.state.config = configRecord || {};
            }
        } catch (error) {
            console.error("Failed to load aged receivable Configuration:", error);
            // Default config is used
        }
    }

    async loadPartners() {

        this.state.availablePartners =
            await this.orm.searchRead('res.partner',[],['id', 'name'],    
                {
    
                    order: 'name asc'
    
                }
    
            );
    
    }

    

    openDebugConfig = async function () {
        try {
            // 1. Call the Python method to get the active (and initialized) config record.
            const configRecord = await this.orm.call(
                configModel,
                'get_active_config',
                [] // No arguments for the @api.model method
            );

            // The ORM call returns the ID of the record.
            const configId = configRecord.id;

            // 2. Open the form view for the retrieved record ID.
            this.action.doAction({
                type: "ir.actions.act_window",
                res_model: configModel,
                res_id: configId, // Pass the specific record ID
                view_mode: "form",
                target: "new",
                views: [[false, "form"]],
                name: "aged receivable Configuration",
            });
            this.loadConfig();
            this.loadLedgerData();
        } catch (error) {
            console.error("Failed to retrieve or initialize aged receivable Configuration:", error);
            // Optionally show a user-facing notification about the error
            this.env.services.notification.add(
                "Could not load the aged receivable Configuration.",
                { type: 'danger' }
            );
        }
    }

    
    calculateTotals() {

        const totals = {
    
            at_date: 0,
    
            bucket_1: 0,
            bucket_2: 0,
            bucket_3: 0,
            bucket_4: 0,
    
            older: 0,
    
            total: 0,
        };
    
        this.state.groupedData.forEach(partner => {
    
            totals.at_date += partner.at_date || 0;
    
            totals.bucket_1 += partner.bucket_1 || 0;
            totals.bucket_2 += partner.bucket_2 || 0;
            totals.bucket_3 += partner.bucket_3 || 0;
            totals.bucket_4 += partner.bucket_4 || 0;
    
            totals.older += partner.older || 0;
    
            totals.total += partner.total || 0;
    
        });
    
        this.state.totals = totals;
    }

    
    async loadLedgerData() {
        let domain = [
            ['move_id.state', '=', 'posted'],
            ['partner_id', '!=', false],
            ['account_id.account_type', '=', 'asset_receivable'],
            ['balance', '!=', 0]
            // ['account_id.active', '=', true]
        ];

        // Add date filters
        if (this.state.asOfDate) {

            domain.push(
                ['date', '<=', this.state.asOfDate]
            );
        
        }

        const lines = await this.orm.call(
            "aged.receivable.report",
            "get_aged_receivable_data",
            [
                this.state.asOfDate,
                this.state.periodLength,
                this.state.agingBasis
            ]
        );
        console.log(lines);

        // Keep only receivable lines
        this.state.ledgerData = lines;
        this.groupDataByPartner();
        this.calculateTotals();
    }

    

    togglePartner(partnerName) {
        this.state.collapsedPartners[partnerName] = !this.state.collapsedPartners[partnerName];
        localStorage.setItem(
            "aged_receivable_collapsed_accounts",
            JSON.stringify(this.state.collapsedPartners)
        );
    }
    
    sortByInvoiceDate() {

        this.state.sortDirection =
            this.state.sortDirection === 'asc'
                ? 'desc'
                : 'asc';
    
        this.state.groupedData.forEach(partner => {
    
            partner.lines.sort((a, b) => {
    
                const dateA =
                    new Date(a.invoice_date);
    
                const dateB =
                    new Date(b.invoice_date);
    
                if (
                    this.state.sortDirection === 'asc'
                ) {
    
                    return dateA - dateB;
    
                }
    
                return dateB - dateA;
    
            });
    
        });
    
    }

    loadMore(partnerName) {

        this.state.visibleLinesCount[partnerName] += 100;
    
    }

    groupDataByPartner() {
        const grouped = {};

        const sortedLines = [...this.state.ledgerData].sort((a, b) => {

            // Sort by accounting date first
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
    
            if (dateA - dateB !== 0) {
                return dateA - dateB;
            }
    
            // Same date → preserve real creation sequence
            return (a.id || 0) - (b.id || 0);
        });

        
        const parseDate = (value) => {

            const [y,m,d] = value.split('-');
        
            return new Date(
                Number(y),
                Number(m)-1,
                Number(d)
            );
        };

        sortedLines.forEach(line => {
            
            if (

                this.state.selectedPartners.length
            
            ) {
            
                const allowed =
            
                    this.state.selectedPartners.map(
            
                        p => p.id
                    );
                if (
                    !allowed.includes(
                        line.partner_id?.[0]
                    )
                ) {            
                    return;

                }           
            }

            if (
                Math.abs(line.amount_residual || 0) <= 0.0001
            ) {
                return;
            }

            // Timezone days 
            
            

            const asOfDate =
                parseDate(this.state.asOfDate);
            
            const agingDate =

                this.state.agingBasis === 'invoice_date'
            
                ? parseDate(line.date)
            
                : parseDate(
            
                    line.date_maturity || line.date
            
                  );
            
            const ageDays = Math.floor(
                (asOfDate - agingDate)
                / 86400000
            );
            
            const bucketSize =
                parseInt(this.state.periodLength || 30);
            
            let bucket_1 = 0;
            let bucket_2 = 0;
            let bucket_3 = 0;
            let bucket_4 = 0;
            let older = 0;
            
            let amount =
                line.amount_residual !== undefined
                    ? line.amount_residual
                    : (line.balance || 0);

            if (ageDays <= 0) {
                // Current / not yet due
            }
            else if (ageDays <= bucketSize) {
                bucket_1 = amount;
            }
            else if (ageDays <= bucketSize * 2) {
                bucket_2 = amount;
            }
            else if (ageDays <= bucketSize * 3) {
                bucket_3 = amount;
            }
            else if (ageDays <= bucketSize * 4) {
                bucket_4 = amount;
            }
            else {
                older = amount;
            }
            
            

    
            const partnerName =
                line.partner_id
                    ? line.partner_id[1]
                    : "Unknown Partner";
    
            if (!grouped[partnerName]) {
    
                grouped[partnerName] = {
                    
                    partner_name: partnerName,
                    at_date: 0,
                    bucket_2: 0,
                    bucket_1: 0,
                    bucket_4: 0,
                    bucket_3: 0,
                    total: 0,
                    older: 0,
                    lines: [],

                };
    
                if (!(partnerName in this.state.collapsedPartners)) {
                    this.state.collapsedPartners[partnerName] = true;
                }

                if (!(partnerName in this.state.visibleLinesCount)) {
                    this.state.visibleLinesCount[partnerName] = 100;
                }
                // grouped[partnerName].runningBalance = 0;
            }
    
            
            const currentAmount =
                ageDays <= 0 ? amount : 0;

            grouped[partnerName].at_date += currentAmount;

            grouped[partnerName].bucket_1 += bucket_1;

            grouped[partnerName].bucket_2 += bucket_2;

            grouped[partnerName].bucket_3 += bucket_3;

            grouped[partnerName].bucket_4 += bucket_4;

            grouped[partnerName].older += older;

            grouped[partnerName].total += amount;

            grouped[partnerName].lines.push({...line,
                invoice_date: line.date,

                at_date: currentAmount,

                bucket_1: bucket_1,
                bucket_2: bucket_2,
                bucket_3: bucket_3,
                bucket_4: bucket_4,

                older: older,

                total: amount,
            });
        });
    
        this.state.groupedData = Object.values(grouped);
    }

    

    

    onSearchKeydown(ev) {
        if (ev.key === "Enter") {
            this.searchJournal();
        }
    }

    async searchJournal() {
        const text = this.searchInput.el.value.trim();


        try {
            const lines = await this.orm.call(

                "aged.receivable.report",
            
                "get_aged_receivable_data",
            
                [
            
                    this.state.asOfDate,
            
                    this.state.periodLength,
            
                    this.state.agingBasis,
            
                    text
            
                ]
            
            );

            console.log(lines);

            this.state.ledgerData = lines;

            // Re-group & recalc totals
            this.groupDataByPartner();
            this.calculateTotals();
        } catch (e) {
            console.error("Search error:", e);
        } finally {
        
        }
    }


    togglePartnerDropdown() {

        this.state.showPartnerDropdown =
    
            !this.state.showPartnerDropdown;
    
    }

    handleOutsidePartnerClick = (ev) => {

        const partnerBox =
    
            ev.target.closest(
    
                '.partner-filter-wrapper'
    
            );
    
        if (!partnerBox) {
    
            this.state.showPartnerDropdown = false;
    
        }
    
    }
    
    
    selectPartner(partner) {

        const exists =
    
            this.state.selectedPartners.find(
    
                p => p.id === partner.id
    
            );
    
        if (exists) {
    
            this.state.selectedPartners =
    
                this.state.selectedPartners.filter(
    
                    p => p.id !== partner.id
    
                );
    
        }
    
        else {
    
            this.state.selectedPartners = [
    
                ...this.state.selectedPartners,
    
                partner
    
            ];
    
        }
    
        this.groupDataByPartner();
    
        this.calculateTotals();
    
    }

    
    async setAgingBasis(value) {

        if (
    
            this.state.agingBasis === value
    
        ) {
    
            return;
    
        }
    
        this.state.agingBasis = value;
    
        await this.applyFilters();
    
    }


    async applyFilters() {
        this.updateBucketHeaders();
        
        await this.loadLedgerData();
    }

    getActiveDateRangeLabel() {
        this.updateBucketHeaders();
        return `As Of Date: ${this.state.asOfDate}`;
    
    }

    formatCurrency(amount, currencySymbol = '₹') {

        const isWhole = Number.isInteger(amount);
    
        let x = Number(amount)
            .toFixed(isWhole ? 0 : 2)
            .split('.');
    
        let intPart = x[0];
        let decPart = x[1] ? '.' + x[1] : '';
    
        if (intPart.length > 3) {
    
            let lastThree =
                intPart.substring(intPart.length - 3);
    
            let otherNumbers =
                intPart.substring(0, intPart.length - 3);
    
            if (otherNumbers !== '') {
    
                otherNumbers =
                    otherNumbers.replace(
                        /\B(?=(\d{2})+(?!\d))/g,
                        ','
                    );
    
                lastThree = ',' + lastThree;
            }
    
            intPart = otherNumbers + lastThree;
        }
    
        return currencySymbol + intPart + decPart;
    }

    updateBucketHeaders() {

        const d = parseInt(this.state.periodLength || 30);
    
        this.state.bucketHeaders = [
            `1-${d}`,
            `${d + 1}-${d * 2}`,
            `${d * 2 + 1}-${d * 3}`,
            `${d * 3 + 1}-${d * 4}`
        ];
    
    }

    initializeDateFilters() {

        const currentYear = new Date().getFullYear();
    
        this.state.monthOptions = [];
    
        for (let i = 0; i < 12; i++) {
    
            const label =
                new Date(currentYear, i, 1)
                    .toLocaleString('default', {
                        month: 'long'
                    });
    
            this.state.monthOptions.push({
                value: `${currentYear}-${i}`,
                label: `${label} ${currentYear}`
            });
        }
    
        this.state.quarterOptions = [
    
            {
                value: `Q1-${currentYear}`,
                label: `Jan - Mar ${currentYear}`
            },
    
            {
                value: `Q2-${currentYear}`,
                label: `Apr - Jun ${currentYear}`
            },
    
            {
                value: `Q3-${currentYear}`,
                label: `Jul - Sep ${currentYear}`
            },
    
            {
                value: `Q4-${currentYear}`,
                label: `Oct - Dec ${currentYear}`
            }
        ];
    
        this.state.years = [];

        for (let y = 1900; y <= 2100; y++) {
            this.state.years.push(y);
        }

        const today = new Date();

        this.state.selectedMonth =
            today.getMonth() + 1;

        this.state.selectedQuarter =
            `Q${Math.floor(today.getMonth() / 3) + 1}`;

        this.state.selectedYear =
            today.getFullYear();    
    }

    formatLocalDate(date) {

        const year = date.getFullYear();
    
        const month =
            String(date.getMonth() + 1)
                .padStart(2, '0');
    
        const day =
            String(date.getDate())
                .padStart(2, '0');
    
        return `${year}-${month}-${day}`;
    }
    

    updateAsOfDateFromFilter() {

        const today = new Date();
    
        if (this.state.dateFilter === "today") {
    
            this.state.asOfDate =
                this.formatLocalDate(today);
        }
    
        else if (this.state.dateFilter === "end_of_month") {
    
            const year =
                Number(this.state.selectedYear);
    
            const month =
                Number(this.state.selectedMonth);
    
            const endDate =
                new Date(
                    year,
                    month,
                    0
                );
    
            this.state.asOfDate =
                this.formatLocalDate(endDate);
        }
    
        else if (this.state.dateFilter === "end_of_quarter") {
    
            const year =
                Number(this.state.selectedYear);
    
            let quarterMonth = 3;
    
            if (this.state.selectedQuarter === "Q2") {
                quarterMonth = 6;
            }
            else if (this.state.selectedQuarter === "Q3") {
                quarterMonth = 9;
            }
            else if (this.state.selectedQuarter === "Q4") {
                quarterMonth = 12;
            }
    
            const endDate =
                new Date(
                    year,
                    quarterMonth,
                    0
                );
    
            this.state.asOfDate =
                this.formatLocalDate(endDate);
        }
    
        else if (this.state.dateFilter === "end_of_year") {
    
            const year =
                Number(this.state.selectedYear);
    
            this.state.asOfDate =
                `${year}-12-31`;
        }
    }
    
    async onDateFilterChange() {
    
        this.updateAsOfDateFromFilter();
    
        await this.applyFilters();
    }


    viewJournalEntry(moveId) {
        if (!moveId) {
            return;
        }
            const action = {
                type: "ir.actions.act_window",
                res_model: "account.move",
                res_id: moveId,
                views: [[false, "form"]],
                target: "current", // opens in same window
            };
            // SAVES which accounts are open and position of scroll  
            localStorage.setItem(
                "aged_receivable_collapsed_accounts",
                JSON.stringify(this.state.collapsedPartners)
            );
            
            localStorage.setItem(
                "aged_receivable_scroll",
                document.querySelector('.o_content')?.scrollTop || 0
            );
            this.env.services.action.doAction(action);
    }

    getAmountClass(amount) {
        if (amount < 0) return 'text-danger';
        return '';
    }

    formatToDDMMYYYY(dateStr) {
        if (!dateStr) return "";
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    formatDate(dateStr) {
        return this.formatToDDMMYYYY(dateStr);
    }

    getFilterTitle() {
        const textSearch = this.searchInput && this.searchInput.el ? this.searchInput.el.value.trim() : null;

        if (textSearch) {
            return `${textSearch}`;
        }

        return "All Records";
    }

    // Export to PDF
    async exportToPDF() {
        this.ui.block();
        try {
            
            console.log(this.state.collapsedPartners);
            // Prepare data for PDF export
            const exportData = {
                as_of_date: this.state.asOfDate,
                aging_basis: this.state.agingBasis,
                period_length: this.state.periodLength,
                bucket_headers: this.state.bucketHeaders,
                grouped_data: this.state.groupedData,
                collapsed_partners: this.state.collapsedPartners,
                totals: this.state.totals,
                company_info: await this.orm.call(
                    "res.company",
                    "get_current_company_info",
                    []
                )
            };

            // Call the PDF export method
            const result = await this.orm.call(
                "aged.receivable.export",
                "export_aged_receivable_pdf",
                [exportData]
            );

            if (result) {
                // Download the PDF
                await this.action.doAction(result);
            } else {
                throw new Error("PDF export failed: Server response did not contain a download URL. Result: " + JSON.stringify(result));
            }
        } catch (error) {
            console.error("Error exporting PDF:", error);
            throw error;
        } finally {
            this.ui.unblock();
        }
    }

    // Export to XLSX
    async exportToXLSX() {
        this.ui.block();
        try {

            // Prepare data for XLSX export
            const exportData = {
                as_of_date: this.state.asOfDate,
                aging_basis: this.state.agingBasis,
                period_length: this.state.periodLength,
                bucket_headers: this.state.bucketHeaders,
                grouped_data: this.state.groupedData,
                collapsed_partners: this.state.collapsedPartners,
                totals: this.state.totals,
                company_info: await this.orm.call(
                    "res.company",
                    "get_current_company_info",
                    []
                )
            };

            // Call the XLSX export method
            const result = await this.orm.call(
                "aged.receivable.export",
                "export_aged_receivable_xlsx",
                [exportData]
            );

            if (result && result.url) {
                // Download the XLSX
                window.open(result.url, '_blank');
            } else {
                console.error("XLSX export failed");
            }
        } catch (error) {
            console.error("Error exporting XLSX:", error);
        } finally {
            this.ui.unblock();
        }
    }
}

AgedReceivableReport.template = "aged_receivable_report.agedReceivableReport";
registry.category("actions").add("aged_receivable_report.aged_receivable_owl", AgedReceivableReport);
