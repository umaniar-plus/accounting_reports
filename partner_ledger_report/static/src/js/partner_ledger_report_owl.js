/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Component, useState, onWillStart, onMounted, useRef } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

const configModel = 'partner.ledger.report.config';

export class PartnerLedgerReport extends Component {
    setup() {
        this.state = useState({
            visibleLinesCount: {},
            ledgerData: [],
            groupedData: [],
            dateFrom: "",
            dateTo: "",
            selectedYear: new Date().getFullYear(),

            availableYears: Array.from(
                { length: 100 },
                (_, i) => new Date().getFullYear() - i
            ),
            totals: {
                debit: 0,
                credit: 0,
                balance: 0
            },
            collapsedPartners: {},
            fyDates: null,
            isDebug: Boolean(odoo.debug),
            sortDirection: 'asc', // added for date sorting   
            selectedAccountType: 'all',   
            config: {
                show_journal: true,
                show_date: true,
                show_due_date: true,
                show_communication: true,
                show_partner: true,
                show_currency: true,
                show_debit: true,
                show_credit: true,
                show_balance: true,
            },
        });

        this.ui = useService("ui");
        this.orm = useService("orm");
        this.dateFromRef = useRef("date-from");
        this.dateToRef = useRef("date-to");
        this.searchInput = useRef("search-input");

        onWillStart(async () => {
            await this.loadConfig();
            await this.initializeFinancialYearDates();
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
                localStorage.getItem("partner_ledger_collapsed_accounts");

            if (savedCollapsed) {
                this.state.collapsedPartners =
                    JSON.parse(savedCollapsed);
            }

            const savedScroll =
                localStorage.getItem("partner_ledger_scroll");

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

    async selectAccountType(type) {

        this.state.selectedAccountType = type;
    
        await this.loadLedgerData();
    }

    reloadPage() {
        window.location.reload();
    }

    async loadConfig() {
        if (!this.state.isDebug) {
            return;
        }
        try {
            const configRecord = await this.orm.call(
                configModel,
                'get_active_config',
                []
            );

            // Assuming configRecord contains fields like show_journal, etc.
            if (configRecord) {
                this.state.config = {
                    show_journal: configRecord.show_journal,
                    show_date: configRecord.show_date,
                    show_due_date: configRecord.show_due_date,
                    show_communication: configRecord.show_communication,
                    show_partner: configRecord.show_partner,
                    show_currency: configRecord.show_currency,
                    show_debit: configRecord.show_debit,
                    show_credit: configRecord.show_credit,
                    show_balance: configRecord.show_balance,
                };
            }
        } catch (error) {
            console.error("Failed to load partner Ledger Configuration:", error);
            // Default config is used
        }
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
                name: "partner Ledger Configuration",
            });
        } catch (error) {
            console.error("Failed to retrieve or initialize partner Ledger Configuration:", error);
            // Optionally show a user-facing notification about the error
            this.env.services.notification.add(
                "Could not load the partner Ledger Configuration.",
                { type: 'danger' }
            );
        }
    }

    

    async initializeFinancialYearDates() {
        if (!this.state.dateFrom || !this.state.dateTo) {
            // Fetch current company's country
            const company = await this.orm.call("res.company", "get_current_company_country", []);
            const fyRange = this.getFinancialYearRange(company.country_code);

            this.state.dateFrom = fyRange.start;
            this.state.dateTo = fyRange.end;
            this.state.fyDates = fyRange; // Store for later use in onMounted
        }
    }

    async loadLedgerData() {
        let domain = [
            ['move_id.state', '=', 'posted'],
            ['partner_id', '!=', false]
            // ['account_id.active', '=', true]
        ];

        // Add date filters
        if (this.state.dateFrom) {
            domain.push(['date', '>=', this.state.dateFrom]);
        }
        if (this.state.dateTo) {
            domain.push(['date', '<=', this.state.dateTo]);
        }
        if (this.state.selectedAccount) {
            domain.push(['account_id', '=', parseInt(this.state.selectedAccount)]);
        }

        const lines = await this.orm.searchRead(
            "account.move.line",
            domain,
            ["move_name", "move_id", "date", "date_maturity", "name", "partner_id", "account_id","amount_currency" ,"currency_id", "debit", "credit", "balance", "account_type"],
            {
                order: "date asc, move_name asc, id asc"
            }
        );
        // Keep only payable/receivable lines
        let filteredLines = lines;
            
        if (this.state.selectedAccountType === 'receivable') {
        
            filteredLines = lines.filter(line =>
                line.account_type === 'asset_receivable'
            );
        
        }
        else if (this.state.selectedAccountType === 'payable') {
        
            filteredLines = lines.filter(line =>
                line.account_type === 'liability_payable'
            );
        
        }
        else {
        
            filteredLines = lines.filter(line =>
                line.account_type === 'asset_receivable' ||
                line.account_type === 'liability_payable'
            );
        }

        this.state.ledgerData = await this.addCurrencySymbols(filteredLines);
        await this.addInitialBalances();
        this.state.visibleLinesCount = {};
        this.groupDataByPartner();
        this.calculateTotals();
    }

    async addInitialBalances() {

        const dateFrom = this.state.dateFrom;
    
        if (!dateFrom) {
            return;
        }
    
        const initialLines = await this.orm.searchRead(
            "account.move.line",
            [
                ['move_id.state', '=', 'posted'],
                ['partner_id', '!=', false],
                ['date', '<', dateFrom]
            ],
            [
                "partner_id",
                "currency_id",
                "debit",
                "credit",
                "balance",
                "account_type"
            ]
        );
    
        const openingBalances = {};
    
        initialLines.forEach(line => {

            if (this.state.selectedAccountType === 'receivable') {
        
                if (line.account_type !== 'asset_receivable') {
                    return;
                }
        
            } else if (this.state.selectedAccountType === 'payable') {
        
                if (line.account_type !== 'liability_payable') {
                    return;
                }
        
            } else {
        
                if (
                    line.account_type !== 'asset_receivable' &&
                    line.account_type !== 'liability_payable'
                ) {
                    return;
                }
            }
    
            const partnerId = line.partner_id[0];
            const partnerName = line.partner_id[1];
    
            if (!openingBalances[partnerId]) {
    
                openingBalances[partnerId] = {
                    partner_id: line.partner_id,
                    debit: 0,
                    credit: 0,
                    balance: 0,
                    currency_id: line.currency_id,
                };
            }
    
            openingBalances[partnerId].debit += line.debit;
            openingBalances[partnerId].credit += line.credit;
            openingBalances[partnerId].balance += line.balance;
        });
    
        const initialBalanceLines = Object.values(openingBalances).map(ob => {
    
            return {
                move_name: "Initial Balance",
                move_id: [null, "Initial Balance"],
                date: dateFrom,
                date_maturity: dateFrom,
                name: "",
                partner_id: ob.partner_id,
                currency_id: ob.currency_id,
                debit: 0,
                credit: 0,
                balance: ob.balance,
                initial_balance: true,
            };
        });
    
        this.state.ledgerData = [
            ...initialBalanceLines,
            ...this.state.ledgerData
        ];
    
        this.state.ledgerData =
            await this.addCurrencySymbols(this.state.ledgerData);
    }
    

    getFinancialYearRange(countryCode) {
        const today = new Date();
        let start, end;

        switch (countryCode) {
            //April 1 - March 31
            case 'IN': // India
            case 'JP': // Japan
            case 'CAD': //Canada
                start = new Date(today.getFullYear(), 3, 1); // April 1
                end = new Date(today.getFullYear() + 1, 2, 31); // March 31 next year
                if (today < start) { // If before April 1, go to previous FY
                    start = new Date(today.getFullYear() - 1, 3, 1);
                    end = new Date(today.getFullYear(), 2, 31);
                }
                break;

            // July 1 - June 30
            case 'AU': // Australia
            case 'NZD': // New Zealand
            case 'PKR': // Pakistan
                start = new Date(today.getFullYear(), 6, 1); // July 1
                end = new Date(today.getFullYear() + 1, 5, 30); // June 30 next year
                if (today < start) {
                    start = new Date(today.getFullYear() - 1, 6, 1);
                    end = new Date(today.getFullYear(), 5, 30);
                }
                break;

            // Jan 1 - Dec 31
            case 'FR': // France
            case 'DE': // Germany
            case 'BRL': // Brazil
            default: // Calendar year
                start = new Date(today.getFullYear(), 0, 1); // Jan 1
                end = new Date(today.getFullYear(), 11, 31); // Dec 31
                break;
        }

        // Format as YYYY-MM-DD for domain
        const formatDate = (d) => d.toISOString().slice(0, 10);
        return { start: formatDate(start), end: formatDate(end) };
    }

    togglePartner(partnerName) {
        this.state.collapsedPartners[partnerName] = !this.state.collapsedPartners[partnerName];
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

        
    
        sortedLines.forEach(line => {
    
            if (
                line.debit === 0 &&
                line.credit === 0 &&
                line.balance === 0
            ) {
                return;
            }
    
            const partnerName =
                line.partner_id
                    ? line.partner_id[1]
                    : "Initial Balance";
    
            if (!grouped[partnerName]) {
    
                grouped[partnerName] = {
                    
                    partner_name: partnerName,
                    debit: 0,
                    credit: 0,
                    balance: 0,
                    lines: [],
                    runningBalance: 0,

                };
    
                if (!(partnerName in this.state.collapsedPartners)) {
                    this.state.collapsedPartners[partnerName] = true;
                }
                // grouped[partnerName].runningBalance = 0;
            }

            if (!(partnerName in this.state.visibleLinesCount)) {
                this.state.visibleLinesCount[partnerName] = 100;
            }
    
            grouped[partnerName].debit += line.debit;
            grouped[partnerName].credit += line.credit;
            grouped[partnerName].balance += line.balance;
            if (line.initial_balance) {

                grouped[partnerName].runningBalance =
                    line.balance;
            
                grouped[partnerName].lines.push({
                    ...line,
                    balance: line.balance,
                });
            
                return;
            }
            grouped[partnerName].runningBalance += line.debit - line.credit;
    
            grouped[partnerName].lines.push({...line,
                balance: grouped[partnerName].runningBalance,
            });
        });
    
        this.state.groupedData = Object.values(grouped);
    }

    loadMore(partnerName) {
        this.state.visibleLinesCount[partnerName] = 
        this.state.visibleLinesCount[partnerName] + 100;
    }

    calculateTotals() {
        this.state.totals = { debit: 0, credit: 0, balance: 0 };

        this.state.ledgerData.forEach(line => {
            this.state.totals.debit += line.debit;
            this.state.totals.credit += line.credit;
        });
        this.state.totals.balance = 0;

        this.state.ledgerData.forEach(line => {
            this.state.totals.balance += line.balance;
        });
    }

    async addCurrencySymbols(lines) {
        // Fetch all unique currency IDs from the lines
        const currencyIds = [...new Set(lines.map(line => line.currency_id ? line.currency_id[0] : false).filter(Boolean))];
        if (!currencyIds.length) return lines;

        const currencies = await this.orm.searchRead(
            "res.currency",
            [['id', 'in', currencyIds]],
            ["name", "symbol"]
        );

        const currencyMap = {};
        currencies.forEach(c => {
            currencyMap[c.id] = c.symbol;
        });

        // Add symbol to each line
        lines.forEach(line => {
            if (line.currency_id && line.currency_id[0]) {
                line.currency_symbol = currencyMap[line.currency_id[0]] || line.currency_id[1];
            } else {
                line.currency_symbol = '$'; // default
            }
        });

        return lines;
    }

    onSearchKeydown(ev) {
        if (ev.key === "Enter") {
            this.searchJournal();
        }
    }

    async searchJournal() {
        const text = this.searchInput.el.value.trim();

        // Base domain for posted, non-active lines
        const domain = [
            ['move_id.state', '=', 'posted'],
            ['account_id.active', '=', true]
        ];

        let dateFrom, dateTo;
        let foundAccountId = null;

        switch (this.state.dateType) {
            case "Month":
                if (this.state.selectedMonth) {
                    const monthIndex = new Date(`${this.state.selectedMonth} 1, 2000`).getMonth();
                    const year = new Date().getFullYear(); // Or state.selectedYear if you have it
                    dateFrom = new Date(year, monthIndex, 1);
                    dateTo = new Date(year, monthIndex + 1, 0); // Last day of month
                }
                break;
            case "Quarter":
                if (this.state.selectedQuarter) {
                    const year = new Date().getFullYear();
                    switch (this.state.selectedQuarter) {
                        case "Q1": dateFrom = new Date(year, 0, 1); dateTo = new Date(year, 2, 31); break;
                        case "Q2": dateFrom = new Date(year, 3, 1); dateTo = new Date(year, 5, 30); break;
                        case "Q3": dateFrom = new Date(year, 6, 1); dateTo = new Date(year, 8, 30); break;
                        case "Q4": dateFrom = new Date(year, 9, 1); dateTo = new Date(year, 11, 31); break;
                    }
                }
                break;
            case "Year":
                if (this.state.dateFrom && this.state.dateTo) {
                    dateFrom = new Date(this.state.dateFrom);
                    dateTo = new Date(this.state.dateTo);
                }
                break;
            case "Custom":
                if (this.state.dateFrom && this.state.dateTo) {
                    dateFrom = new Date(this.state.dateFrom);
                    dateTo = new Date(this.state.dateTo);
                }
                break;
            default:
                if (this.state.fyDates) {
                    dateFrom = new Date(this.state.fyDates.start);
                    dateTo = new Date(this.state.fyDates.end);
                }
        }

//        console.log(dateFrom);
//        console.log(dateTo);

        if (dateFrom && dateTo) {
            domain.push(['date', '>=', dateFrom.toISOString().slice(0, 10)]);
            domain.push(['date', '<=', dateTo.toISOString().slice(0, 10)]);
        }


        // If text exists, search by name, move_name, or partner
        if (text) {
            const accountSearchDomain = [['name', 'ilike', text]];
            const accounts = await this.orm.searchRead(
                "account.account",
                accountSearchDomain,
                ["id"]
            );

            if (accounts.length > 0) {
                foundAccountId = accounts[0].id;
            }

            domain.push('|');
            domain.push('|');
            domain.push('|');
            domain.push('|');
            domain.push('|');
            domain.push('|');
            domain.push('|');
                    
            domain.push(['name', 'ilike', text]);
            domain.push(['move_name', 'ilike', text]);
            domain.push(['account_id.name', 'ilike', text]);
            domain.push(['partner_id.name', 'ilike', text]);
            domain.push(['debit', 'ilike', text]);
            domain.push(['credit', 'ilike', text]);
            domain.push(['balance', 'ilike', text]);
            domain.push(['amount_currency', 'ilike', text]);
        }

        const originalSelectedAccount = this.state.selectedAccount;
        if (foundAccountId) {
            this.state.selectedAccount = foundAccountId.toString();
        } else {
            this.state.selectedAccount = null;
        }

        try {
            const lines = await this.orm.searchRead(
                "account.move.line",
                domain,
                ["move_name", "move_id", "date", "date_maturity", "name", "partner_id", "account_id","amount_currency" ,"currency_id", "debit", "credit", "balance","account_type"],
                {
                    order: "date asc, move_name asc, id asc"
                }
            );
            console.log(lines);

            let filteredLines = lines;

            if (this.state.selectedAccountType === 'receivable') {

                filteredLines = lines.filter(line =>
                    line.account_type === 'asset_receivable'
                );
            
            }
            else if (this.state.selectedAccountType === 'payable') {
            
                filteredLines = lines.filter(line =>
                    line.account_type === 'liability_payable'
                );
            
            }
            else {
            
                filteredLines = lines.filter(line =>
                    line.account_type === 'asset_receivable' ||
                    line.account_type === 'liability_payable'
                );
            }

            this.state.ledgerData = await this.addCurrencySymbols(filteredLines);
            
            await this.addInitialBalances();    
            // Re-group & recalc totals
            this.groupDataByPartner();
            this.calculateTotals();
        } catch (e) {
            console.error("Search error:", e);
        } finally {
            this.state.selectedAccount = originalSelectedAccount;
        }
    }

    selectDateType(type) {

        this.state.dateType = type;
    
        this.state.selectedMonth = null;
        this.state.selectedQuarter = null;
        this.state.selectedYear = this.state.selectedYear || new Date().getFullYear();
    
        if (type === 'Custom') {
    
            this.state.dateFrom =
                this.dateFromRef.el?.value || '';
    
            this.state.dateTo =
                this.dateToRef.el?.value || '';
        }
    }

    selectMonth(month) {
        this.state.selectedMonth = month;

        if (!this.state.selectedYear) {
            this.state.selectedYear = new Date().getFullYear();
        }

        const monthIndex = [
            'January','February','March','April','May','June',
            'July','August','September','October','November','December'
        ].indexOf(month);

        const year = this.state.selectedYear;

        this.state.dateFrom =
            `${year}-${String(monthIndex + 1).padStart(2,'0')}-01`;

        this.state.dateTo =
            `${year}-${String(monthIndex + 1).padStart(2,'0')}-${new Date(year, monthIndex + 1, 0).getDate()}`;

        this.loadLedgerData();
    }

    onYearSelect(year) {

        this.state.selectedYear = year;
    
        if (
            this.state.dateType === 'Month' &&
            this.state.selectedMonth
        ) {
            this.selectMonth(this.state.selectedMonth);
        }
    
        if (
            this.state.dateType === 'Quarter' &&
            this.state.selectedQuarter
        ) {
            this.selectQuarter(this.state.selectedQuarter);
        }
    
        if (this.state.dateType === 'Year') {
    
            this.onYearChange({
                target: { value: year }
            });
        }
    }



    selectQuarter(quarter) {

        this.state.selectedQuarter = quarter;
    
        if (!this.state.selectedYear) {
            this.state.selectedYear = new Date().getFullYear();
        }
    
        const year =
            this.state.selectedYear ||
            new Date().getFullYear();
    
        switch(quarter) {
    
            case 'Q1':
                this.state.dateFrom = `${year}-01-01`;
                this.state.dateTo   = `${year}-03-31`;
                break;
    
            case 'Q2':
                this.state.dateFrom = `${year}-04-01`;
                this.state.dateTo   = `${year}-06-30`;
                break;
    
            case 'Q3':
                this.state.dateFrom = `${year}-07-01`;
                this.state.dateTo   = `${year}-09-30`;
                break;
    
            case 'Q4':
                this.state.dateFrom = `${year}-10-01`;
                this.state.dateTo   = `${year}-12-31`;
                break;
        }
    
        this.loadLedgerData();
    }

    onYearChange(ev) {

        const year =
            parseInt(ev.target.value);
    
        if (!isNaN(year)) {
    
            this.state.dateFrom =
                `${year}-04-01`;
    
            this.state.dateTo =
                `${year + 1}-03-31`;
    
            this.loadLedgerData();
        }
    }

    selectFinancialYear(year) {
        this.onYearChange({
            target: { value: year }
        });
    }

    onCustomDateFromChange(ev) {
        const fromDate = ev.target.value;
        this.state.dateFrom = fromDate;

        // Restrict 'To' date
        if (this.dateToRef.el) {
            this.dateToRef.el.min = fromDate;

            // Optional: if current 'To' date is before 'From', reset it
            if (this.dateToRef.el.value && this.dateToRef.el.value < fromDate) {
                this.dateToRef.el.value = fromDate;
                this.state.dateTo = fromDate;
            }
        }
    }

    async applyFilters() {
        const domain = [
            ['move_id.state', '=', 'posted'],
        ];

        // Only add filters if values are provided
        const dateFrom = this.dateFromRef.el?.value;
        const dateTo = this.dateToRef.el?.value;
        const selectedAccount = this.state.selectedAccount || null;

        if (dateFrom) {
            domain.push(['date', '>=', dateFrom]);
        }
        if (dateTo) {
            domain.push(['date', '<=', dateTo]);
        }
        if (selectedAccount) {
            domain.push(['account_id', '=', parseInt(selectedAccount)]);
        }

        const lines = await this.orm.searchRead(
            "account.move.line",
            domain,
            ["move_name", "move_id", "date", "date_maturity", "name", "partner_id", "account_id","amount_currency" ,"currency_id", "debit", "credit", "balance","account_type"],
            {
                order: "date asc, move_name asc, id asc"
            }
        
        );

        this.state.ledgerData = await this.addCurrencySymbols(lines);

        // Update state with current filter values for initial balance calculation
        this.state.dateFrom = dateFrom;
        this.state.dateTo = dateTo;
        this.state.selectedAccount = selectedAccount;

        // Add initial balances based on the filtered date range
        await this.addInitialBalances();
        this.groupDataByPartner();
        this.calculateTotals();
    }

    getActiveDateRangeLabel() {
        // Month
        if (this.state.dateType === "Month" && this.state.selectedMonth) {
            return `Month: ${this.state.selectedMonth}`;
        }

        // Quarter with month range
        if (this.state.dateType === "Quarter" && this.state.selectedQuarter) {
            const quarterMap = {
                Q1: "Jan-Mar",
                Q2: "Apr-Jun",
                Q3: "Jul-Sep",
                Q4: "Oct-Dec",
            };
            return `Quarter: ${this.state.selectedQuarter} (${quarterMap[this.state.selectedQuarter] || ""})`;
        }

        // Year
        if (this.state.dateType === "Year" && this.state.dateFrom && this.state.dateTo) {
            const year = new Date(this.state.dateFrom).getFullYear();
            return `Year: ${year}`;
        }

        // Custom date range
        if (this.state.dateType === "Custom" && this.state.dateFrom && this.state.dateTo) {
            const formatDate = (d) => {
                const date = new Date(d);
                const day = String(date.getDate()).padStart(2, "0");
                const month = String(date.getMonth() + 1).padStart(2, "0");
                const year = date.getFullYear();
                return `${day}-${month}-${year}`;
            };
            return `Custom: ${formatDate(this.state.dateFrom)} → ${formatDate(this.state.dateTo)}`;
        }

        // Financial year
        if (this.state.fyDates) {
            const formatDate = (d) => {
                const date = new Date(d);
                const day = String(date.getDate()).padStart(2, "0");
                const month = String(date.getMonth() + 1).padStart(2, "0");
                const year = date.getFullYear();
                return `${day}-${month}-${year}`;
            };
            return `Financial Year: ${formatDate(this.state.fyDates.start)} → ${formatDate(this.state.fyDates.end)}`;
        }

        return "All Records";
    }

    formatCurrency(amount, currencySymbol = '$', currencyName = null) {
        // Determine if it's INR based on symbol or currency name
        const isINR = currencySymbol === '₹' ||
                      (currencyName && currencyName.toUpperCase().includes('INR')) ||
                      (currencyName && currencyName.toUpperCase().includes('RUPEE'));

        const isWhole = Number.isInteger(amount);

        if (isINR) {
            // Indian format: ₹ 1,05,000 (lakhs and crores system)
            let x = amount.toFixed(isWhole ? 0 : 2).split('.');
            let intPart = x[0];
            let decPart = x.length > 1 && x[1] !== '00' ? '.' + x[1] : '';

            // Handle Indian numbering system
            if (intPart.length > 3) {
                // Take last 3 digits
                let lastThree = intPart.substring(intPart.length - 3);
                let otherNumbers = intPart.substring(0, intPart.length - 3);

                // Apply Indian grouping (every 2 digits after first 3)
                if (otherNumbers !== '') {
                    otherNumbers = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
                    lastThree = ',' + lastThree;
                }

                intPart = otherNumbers + lastThree;
            }

            return currencySymbol + ' ' + intPart + decPart;
        } else {
            // International format: $ 105,000 (thousands system)
            let options = {
                minimumFractionDigits: isWhole ? 0 : 2,
                maximumFractionDigits: isWhole ? 0 : 2,
            };
            return currencySymbol + ' ' + amount.toLocaleString('en-US', options);
        }
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
                "partner_ledger_collapsed_accounts",
                JSON.stringify(this.state.collapsedPartners)
            );
            
            localStorage.setItem(
                "partner_ledger_scroll",
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
            const searchText = this.searchInput.el.value.trim();
            const dateFrom = this.state.dateFrom;
            const dateTo = this.state.dateTo;
            let month = null;
            let quarter = null;
            let year = null;

            if (this.state.dateType === 'Month' && this.state.selectedMonth) {
                // Convert Month name ('October') to month index (10)
                const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                month = monthNames.indexOf(this.state.selectedMonth) + 1; // 1-indexed month
                year = new Date(dateFrom).getFullYear(); // Get year from the calculated date range

            } else if (this.state.dateType === 'Quarter' && this.state.selectedQuarter) {
                // Pass the quarter label (Q1, Q2, etc.)
                quarter = this.state.selectedQuarter;
                year = new Date(dateFrom).getFullYear();

            } else if ((this.state.dateType === 'Year' || !this.state.dateType) && dateFrom) {
                // This covers 'Year' selection and the default Financial Year initialization
                year = new Date(dateFrom).getFullYear();
            }

            // Prepare data for PDF export
            const exportData = {
                date_from: dateFrom,
                date_to: dateTo,
                month: month,
                quarter: quarter,
                year: year,
                filter_title: this.getFilterTitle(),
                ledger_data: this.state.ledgerData,
                grouped_data: this.state.groupedData,
                collapsed_partners: this.state.collapsedPartners,
                totals: this.state.totals,
                company_info: await this.orm.call("res.company", "get_current_company_info", []),
                search_text: searchText,
            };

            // Call the PDF export method
            const result = await this.orm.call(
                "partner.ledger.export",
                "export_partner_ledger_pdf",
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
            const dateFrom = this.state.dateFrom;
            const dateTo = this.state.dateTo;
            let month = null;
            let quarter = null;
            let year = null;

            if (this.state.dateType === 'Month' && this.state.selectedMonth) {
                // Convert Month name ('October') to month index (10)
                const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                month = monthNames.indexOf(this.state.selectedMonth) + 1; // 1-indexed month
                year = new Date(dateFrom).getFullYear(); // Get year from the calculated date range

            } else if (this.state.dateType === 'Quarter' && this.state.selectedQuarter) {
                // Pass the quarter label (Q1, Q2, etc.)
                quarter = this.state.selectedQuarter;
                year = new Date(dateFrom).getFullYear();

            } else if ((this.state.dateType === 'Year' || !this.state.dateType) && dateFrom) {
                // This covers 'Year' selection and the default Financial Year initialization
                year = new Date(dateFrom).getFullYear();
            }

            // Prepare data for XLSX export
            const exportData = {
                date_from: dateFrom,
                date_to: dateTo,
                month: month,
                quarter: quarter,
                year: year,
                filter_title: this.getFilterTitle(),
                ledger_data: this.state.ledgerData,
                grouped_data: this.state.groupedData,
                collapsed_partners: this.state.collapsedPartners,
                totals: this.state.totals,
                company_info: await this.orm.call("res.company", "get_current_company_info", [])
            };

            // Call the XLSX export method
            const result = await this.orm.call(
                "partner.ledger.export",
                "export_partner_ledger_xlsx",
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

PartnerLedgerReport.template = "partner_ledger_report.partnerLedgerReport";
registry.category("actions").add("partner_ledger_report.partner_ledger_owl", PartnerLedgerReport);
