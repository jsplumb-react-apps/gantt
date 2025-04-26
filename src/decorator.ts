import {
    BrowserElement,
    DecorateParams, DecorateResetParams,
    Decorator,
    FixedElementHorizontalAlignments,
    newRecadoInstance, Surface, FixedElementVerticalAlignments, FixedElement, Recado
} from "@jsplumbtoolkit/browser-ui"

import {ONE_WEEK_IN_MILLISECONDS, STEP_WIDTH} from "./constants"
import {Gantt} from "./defs"
import {NARROW_DAY_FORMAT, getWeekOfYear, MONTH_FORMAT, SHORT_DAY_FORMAT, millisecondsToDays} from "./util"
import {TaskEntry, TimelineHeaderEntry} from "./defs"


const FIXED_ELEMENT_LABELS = "labels"
const FIXED_ELEMENT_TIMELINE = "timeline"
const FIXED_ELEMENT_DAY_STRIPES = "dayStripes"
const FIXED_ELEMENT_RIGHT_NOW = "rightNow"

const CLASS_DAY_STRIPE = "jtk-gantt-day-stripe"
const CLASS_DAY_STRIPE_ALT = "jtk-gantt-day-stripe-alt"

function createTemplateParser(gantt:Gantt) {
    return newRecadoInstance({
        templates:{
            [FIXED_ELEMENT_LABELS]:`<div class="jtk-gantt-task-labels" data-jtk-not-draggable="true">
                    <r-each in="entries" key="id">
                        <div data-jtk-type="{{type}}" class="jtk-gantt-task-label" style="height:${gantt.rowHeight}px;margin-left:{{indent}}rem">{{name}}</div>
                        </r-each>
                        </div>`,
            [FIXED_ELEMENT_TIMELINE]:`<div class="jtk-gantt-timeline" style="width:{{width}}px" data-jtk-not-draggable="true">
                    <r-each in="headers" key="id">
                        <div class="jtk-gantt-timeline-row jtk-gantt-timeline-{{id}}">
                            <r-each in="values" id="id">
                                <div class="jtk-gantt-timeline-entry" style="flex-basis:{{size}}px;height:${gantt.rowHeight}px">
                                    <r-if test="type == 'day'">                                    
                                        <r-tmpl id="timelineLabel"/>
                                    </r-if>
                                    <r-if test="type != 'day'">
                                        {{label}}
                                    </r-if>  
                                </div>
                            </r-each>
                        </div>
                    </r-each>
                </div>`,
            [FIXED_ELEMENT_DAY_STRIPES]:`<div class="jtk-gantt-day-stripes">        
                                            <r-each in="days" id="id">
                                                <div class="{{clazz}}" style="flex-basis:{{size}}px;height:{{height}}px"/>
                                            </r-each>       
                                        </div>`,
            timelineLabel:(gantt.showDayName && gantt.showDayNumber) ? `<span>{{day}}</span><span class="jtk-gantt-day-name">{{label}}</span>` : gantt.showDayNumber ? `<span>{{day}}</span>` : `<span>{{label}}</span>`,
            [FIXED_ELEMENT_RIGHT_NOW]:`<div class="jtk-gantt-right-now" style="height:{{height}}px"/>`
        }
    })
}


/**
 * Decorates the chart with the labels on the left, timeline headers, day stripes (for want of a better description!) and also the current day line.
 */
export class GanttDecorator extends Decorator {

    incremental: boolean = false
    gantt:Gantt

    labels!:FixedElement
    timelines!:FixedElement

    templateParser:Recado

    constructor(params: {gantt:Gantt}, adapter: Surface, container: BrowserElement, id: string) {
        super(params, adapter, container, id)
        this.gantt = params.gantt
        this.templateParser = createTemplateParser(this.gantt)
    }

    /**
     * Adjusts the pan and of the display such that the task bars are not underneath and of the decoration
     */
    panToVisible() {
        if (this.labels != null && this.timelines != null) {
            const dx = this.labels.currentPosition.x - this.labels.requestedPosition.x
            const dy = this.timelines.currentPosition.y - this.timelines.requestedPosition.y
            this.adapter.pan(dx, dy, true)
        }
    }

    /**
     * Adjusts the pan and the zoom of the display such that the task bars are not underneath and of the decoration, and the entire
     * chart is visible in the viewport.
     */
    zoomToVisible() {

        this.panToVisible()
        this.adapter.zoomToDecorator({decorator:this})
    }

    private _decorateLabels(params:DecorateParams) {

        const entries:Array<{id:string, name:string, indent:number, type:string}> = []
        function _one(entry:TaskEntry, indent:number) {
            entries.push({id:entry.node.id, name:entry.node.data.name, indent, type:entry.node.type})
            entry.subtasks.forEach(st => _one(st, indent + 1))
        }
        this.gantt.entries.forEach(entry => _one(entry, 0))

        //
        const labels = this.templateParser.template(FIXED_ELEMENT_LABELS, {entries}).childNodes[0] as BrowserElement
        this.labels = params.fixElement(labels, {x:0, y:0}, {
            left:true,
            alignX:FixedElementHorizontalAlignments.right
        }, FIXED_ELEMENT_LABELS)
        //
    }

    private _addTimelineDays(headers:Array<TimelineHeaderEntry>) {
        const days = []
        const formatter = this.gantt.dayNameFormat === "short" ? SHORT_DAY_FORMAT : NARROW_DAY_FORMAT
        const currentDay = new Date(this.gantt.minValue.current)
        while (currentDay.getTime() < this.gantt.maxValue.current) {
            days.push({ day:currentDay.getDate(), start:currentDay.getTime(), end:currentDay.getTime(), label:formatter.format(currentDay), size:STEP_WIDTH, id:`day_${days.length}`, type:"day"})
            currentDay.setDate(currentDay.getDate() + 1)
        }

        headers.unshift({values:days, id:"day"})
    }

    private _addTimelineWeeks(headers:Array<TimelineHeaderEntry>) {
        const weeks = []

        let currentWeekDetails = getWeekOfYear(this.gantt.minValue.current)
        const currentWeek = new Date(currentWeekDetails[1])
        let currentWeekMillis = currentWeek.getTime()
        while(currentWeekMillis < this.gantt.maxValue.current) {
            const start = Math.max(this.gantt.minValue.current, currentWeekMillis)
            const end = Math.min(currentWeekMillis + ONE_WEEK_IN_MILLISECONDS, this.gantt.maxValue.current)
            weeks.push({
                start,
                end,
                label:`Week ${currentWeekDetails[0]}`,
                size:STEP_WIDTH * millisecondsToDays(end - start),
                id:`week_${weeks.length}`,
                type:"week"
            })
            currentWeekMillis += ONE_WEEK_IN_MILLISECONDS
            currentWeekDetails = getWeekOfYear(currentWeekMillis)

        }

        headers.unshift({values:weeks, id:"weeks"})
    }

    private _addTimelineMonths(headers:Array<TimelineHeaderEntry>) {
        const months = []
        const currentMonth = new Date(this.gantt.minValue.current)
        currentMonth.setDate(1)

        let currentMonthStart = currentMonth.getTime()
        while(currentMonthStart < this.gantt.maxValue.current) {
            const start = Math.max(this.gantt.minValue.current, currentMonthStart)
            const monthName = MONTH_FORMAT.format(new Date(start))

            const nextMonth = new Date(currentMonthStart)
            nextMonth.setMonth(nextMonth.getMonth() + 1)
            nextMonth.setDate(1)

            const end = Math.min(this.gantt.maxValue.current, nextMonth.getTime())
            months.push({
                start:start,
                end:end,
                label:monthName,
                size:STEP_WIDTH * millisecondsToDays(end - start),
                id:`month_${start}`,
                type:"month"
            })
            currentMonthStart = nextMonth.getTime()
        }

        headers.unshift({values:months, id:"months"})
    }

    private _addTimelineQuarters(headers:Array<TimelineHeaderEntry>) {
        const quarters = []

        const startDate = new Date(this.gantt.minValue.current)
        startDate.setDate(1)
        const currentMonth = startDate.getMonth()
        let currentQuarter = Math.floor(currentMonth / 3)

        let startMonthForQuarter = currentQuarter * 3
        startDate.setMonth(startMonthForQuarter)
        startDate.setDate(1)
        let currentQuarterStart = startDate.getTime()

        while (currentQuarterStart < this.gantt.maxValue.current) {

            const start = Math.max(this.gantt.minValue.current, currentQuarterStart)

            currentQuarter = Math.floor(startDate.getMonth() / 3)
            const label = `Q${currentQuarter + 1} ${startDate.getFullYear()}`

            const nextQuarter = new Date(startDate)
            nextQuarter.setMonth(nextQuarter.getMonth() + 3)
            nextQuarter.setDate(1)

            const end = Math.min(this.gantt.maxValue.current, nextQuarter.getTime())
            quarters.push({
                start:start,
                end:end,
                label,
                size:STEP_WIDTH * millisecondsToDays(end - start),
                id:`quarter_${start}`,
                type:"quarter"
            })
            currentQuarterStart = nextQuarter.getTime()
            startDate.setTime(currentQuarterStart)
        }

        headers.unshift({values:quarters, id:"quarters"})
    }

    private _decorateTimeline(params:DecorateParams) {

        const dayRange = millisecondsToDays(this.gantt.maxValue.current - this.gantt.minValue.current)

        const headers:Array<TimelineHeaderEntry> = []
        if (this.gantt.showDays) {
            this._addTimelineDays(headers)
        }

        if (this.gantt.showWeekOfYear) {
            this._addTimelineWeeks(headers)
        }

        if(this.gantt.showMonthNames) {
            this._addTimelineMonths(headers)
        }

        if (this.gantt.showQuarter) {
            this._addTimelineQuarters(headers)
        }

        //
        const timelines = this.templateParser.template(FIXED_ELEMENT_TIMELINE, {headers, width:dayRange * STEP_WIDTH}).childNodes[0] as BrowserElement
        this.timelines = params.fixElement(timelines, {x:0, y:-10}, {
            top:true,
            alignY:FixedElementVerticalAlignments.bottom
        }, FIXED_ELEMENT_TIMELINE)
    }

    private _decorateBody(params:DecorateParams) {

        const stripeHeight = params.toolkit.getNodes().length * this.gantt.rowHeight
        const dayRange = millisecondsToDays(this.gantt.maxValue.current - this.gantt.minValue.current)

        const days = []
        let flipflop = false
        for (let i = 0; i < dayRange; i++) {
            days.push({
                clazz:flipflop ? CLASS_DAY_STRIPE : CLASS_DAY_STRIPE_ALT,
                left:i * STEP_WIDTH,
                size:STEP_WIDTH,
                height:stripeHeight,
                id:i
            })

            flipflop = !flipflop
        }

        const h = this.templateParser.template(FIXED_ELEMENT_DAY_STRIPES, {days}).childNodes[0] as BrowserElement
        params.fixElement(h, {x:0, y:0}, {
            top:true
        })

        const rightNow = new Date().getTime()
        if (this.gantt.minValue.current < rightNow && this.gantt.maxValue.current > rightNow) {
            const rn = this.templateParser.template(FIXED_ELEMENT_RIGHT_NOW, {height:stripeHeight}).childNodes[0] as BrowserElement
            const xLocDays = millisecondsToDays(rightNow - this.gantt.minValue.current)
            params.fixElement(rn, {x:xLocDays * STEP_WIDTH, y:0}, {
                top:true
            })
        }

    }

    decorate(params:DecorateParams) {
        this._decorateLabels(params)
        this._decorateTimeline(params)
        this._decorateBody(params)
    }

    reset(params:DecorateResetParams) { }

}
