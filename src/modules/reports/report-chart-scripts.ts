import type { WeeklyReportData } from "@/modules/reports/report-model";

export function buildReportChartScripts(data: WeeklyReportData): string {
  return `
<script>
(function(){
  function init(id, opt) {
    var d = document.getElementById(id);
    if (!d) return;
    var c = echarts.init(d);
    c.setOption(opt);
    window.addEventListener('resize', function(){ c.resize(); });
  }
  init('salesTrend', {
    tooltip:{trigger:'axis',axisPointer:{type:'cross'},textStyle:{fontSize:11}},
    legend:{show:true,bottom:0,textStyle:{fontSize:11}},
    grid:{left:'3%',right:'4%',bottom:'15%',top:'15%',containLabel:true},
    xAxis:{type:'category',data:${JSON.stringify(data.dateLabels)},axisLabel:{fontSize:11,rotate:30}},
    yAxis:{type:'value',name:'元',axisLabel:{fontSize:11}},
    title:{text:'区域销售额趋势',left:'center',textStyle:{fontSize:14,fontWeight:'bold',color:'#1a1a1a'}},
    series:[
      {name:'实际销售额',type:'line',data:${JSON.stringify(data.salesTrend)},smooth:true,itemStyle:{color:'#FFE600'},lineStyle:{width:3},areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(255,230,0,0.4)'},{offset:1,color:'rgba(255,230,0,0.05)'}]}}},
      {name:'销售目标',type:'line',data:${JSON.stringify(data.targetTrend)},smooth:false,itemStyle:{color:'#c62828'},lineStyle:{type:'dashed',width:2}}
    ]
  });
  init('orderTrend', {
    tooltip:{trigger:'axis',axisPointer:{type:'cross'},textStyle:{fontSize:11}},
    legend:{show:true,bottom:0,textStyle:{fontSize:11}},
    grid:{left:'3%',right:'4%',bottom:'15%',top:'15%',containLabel:true},
    xAxis:{type:'category',data:${JSON.stringify(data.dateLabels)},axisLabel:{fontSize:11,rotate:30}},
    yAxis:{type:'value',name:'单',axisLabel:{fontSize:11}},
    title:{text:'区域订单量趋势',left:'center',textStyle:{fontSize:14,fontWeight:'bold',color:'#1a1a1a'}},
    series:[{name:'订单量',type:'bar',data:${JSON.stringify(data.orderTrend)},itemStyle:{color:'#1a1a1a',borderRadius:[3,3,0,0]}}]
  });
  init('aovTrend', {
    tooltip:{trigger:'axis',axisPointer:{type:'cross'},textStyle:{fontSize:11}},
    legend:{show:true,bottom:0,textStyle:{fontSize:11}},
    grid:{left:'3%',right:'4%',bottom:'15%',top:'15%',containLabel:true},
    xAxis:{type:'category',data:${JSON.stringify(data.dateLabels)},axisLabel:{fontSize:11,rotate:30}},
    yAxis:{type:'value',name:'元',axisLabel:{fontSize:11}},
    title:{text:'区域客单价变化',left:'center',textStyle:{fontSize:14,fontWeight:'bold',color:'#1a1a1a'}},
    series:[{name:'客单价',type:'line',data:${JSON.stringify(data.aovTrend.map((value) => +value.toFixed(2)))},smooth:true,itemStyle:{color:'#1565c0'},lineStyle:{width:3},symbol:'circle',symbolSize:6}]
  });
  init('channelTrend', {
    tooltip:{trigger:'axis',textStyle:{fontSize:11}},
    legend:{show:true,bottom:0,textStyle:{fontSize:11}},
    grid:{left:'3%',right:'4%',bottom:'15%',top:'15%',containLabel:true},
    xAxis:{type:'category',data:${JSON.stringify(data.dateLabels)},axisLabel:{fontSize:11,rotate:30}},
    yAxis:{type:'value',name:'元',axisLabel:{fontSize:11}},
    title:{text:'渠道销售趋势',left:'center',textStyle:{fontSize:14,fontWeight:'bold',color:'#1a1a1a'}},
    color:['#FFE600','#1a1a1a','#c62828','#2e7d32','#1565c0','#f57c00'],
    series:${JSON.stringify(data.channelSeries)}
  });
  init('storeCompare', {
    tooltip:{trigger:'axis',axisPointer:{type:'shadow'}},
    legend:{bottom:0,textStyle:{fontSize:11}},
    grid:{left:'3%',right:'4%',bottom:'18%',top:'12%',containLabel:true},
    xAxis:{type:'category',data:${JSON.stringify(data.storeNames)},axisLabel:{fontSize:10,rotate:30}},
    yAxis:{type:'value',name:'销售额（元）',axisLabel:{fontSize:11}},
    title:{text:'各门店销售达成对比',left:'center',textStyle:{fontSize:14,fontWeight:'bold',color:'#1a1a1a'}},
    series:[
      {name:'实际销售',type:'bar',data:${JSON.stringify(data.storeSales)},itemStyle:{color:'#FFE600',borderRadius:[3,3,0,0]}},
      {name:'目标',type:'bar',data:${JSON.stringify(data.storeTargets)},itemStyle:{color:'#e0e0e0',borderRadius:[3,3,0,0]}}
    ]
  });
})();
<\/script>`;
}
