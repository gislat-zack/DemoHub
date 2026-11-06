const { layout, escapeHtml, formatBytes, statCard, iconSvg, fileKindIcon } = require('./layout');
const { typeLabelLong } = require('../services/fileTypes');

const CHART_COLORS = ['#4f46e5', '#059669', '#f59e0b', '#dc2626', '#7c6ff2', '#0ea5e9', '#ec4899', '#f97316', '#84cc16', '#64748b'];

function formatDate(value) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function shortDate(value) {
  return String(value || '').slice(5) || '-';
}

function chartEmpty(message) {
  return `<div class="chart-empty">${escapeHtml(message)}</div>`;
}

function renderUploadTrend(trend = []) {
  const data = Array.isArray(trend) ? trend : [];
  if (data.length === 0) return chartEmpty('暂无上传数据');

  const counts = data.map((item) => Number(item.count || 0));
  const max = Math.max(1, ...counts);
  const bars = data.map((item, index) => {
    const count = Number(item.count || 0);
    const height = count > 0 ? Math.max(8, Math.round((count / max) * 100)) : 3;
    const color = count > 0 ? '#4f46e5' : 'rgba(79,70,229,0.18)';
    return `<div class="trend-bar-wrap" title="${escapeHtml(item.day)}：${escapeHtml(count)}">
      <div class="trend-bar" style="height:${height}%;background:${color};"></div>
      ${index % 5 === 0 ? `<span class="trend-dot-label">${escapeHtml(shortDate(item.day))}</span>` : ''}
    </div>`;
  }).join('');

  const total = counts.reduce((sum, value) => sum + value, 0);
  const peak = Math.max(...counts);

  return `<div class="css-trend-chart">
    <div class="trend-summary">
      <span>30 天上传总量 <strong>${escapeHtml(total)}</strong></span>
      <span>峰值 <strong>${escapeHtml(peak)}</strong></span>
    </div>
    <div class="trend-bars">${bars}</div>
  </div>`;
}

function renderHorizontalBars(items = [], options = {}) {
  const data = Array.isArray(items) ? items : [];
  if (data.length === 0) return chartEmpty(options.emptyText || '暂无数据');

  const valueKey = options.valueKey || 'value';
  const max = Math.max(1, ...data.map((item) => Number(item[valueKey] || 0)));
  const formatter = options.formatter || ((value) => value);

  return `<div class="css-bar-list">
    ${data.map((item, index) => {
      const value = Number(item[valueKey] || 0);
      const width = value > 0 ? Math.max(4, Math.round((value / max) * 100)) : 1;
      const color = CHART_COLORS[index % CHART_COLORS.length];
      return `<div class="css-bar-row">
        <div class="css-bar-label" title="${escapeHtml(item.name || '-')}">${escapeHtml(item.name || '-')}</div>
        <div class="css-bar-track">
          <div class="css-bar-fill" style="width:${width}%;background:${color};"></div>
        </div>
        <div class="css-bar-value">${escapeHtml(formatter(value))}</div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderTypeDistribution(typeDistribution = []) {
  const data = Array.isArray(typeDistribution) ? typeDistribution : [];
  const total = data.reduce((sum, item) => sum + Number(item.count || 0), 0);
  if (!total) return chartEmpty('暂无类型数据');

  let cursor = 0;
  const segments = data.map((item, index) => {
    const percent = (Number(item.count || 0) / total) * 100;
    const start = cursor;
    cursor += percent;
    const color = CHART_COLORS[index % CHART_COLORS.length];
    return `${color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  }).join(', ');

  const legend = data.map((item, index) => {
    const count = Number(item.count || 0);
    const percent = total ? ((count / total) * 100).toFixed(1) : '0.0';
    const color = CHART_COLORS[index % CHART_COLORS.length];
    return `<div class="type-legend-item">
      <span class="type-legend-dot" style="background:${color};"></span>
      <span class="type-legend-name">${escapeHtml(typeLabelLong(item.kind))}</span>
      <span class="type-legend-value">${escapeHtml(count)} / ${escapeHtml(percent)}%</span>
    </div>`;
  }).join('');

  return `<div class="type-dist-chart">
    <div class="type-donut" style="background:conic-gradient(${segments});">
      <div class="type-donut-hole"><strong>${escapeHtml(total)}</strong><span>站点</span></div>
    </div>
    <div class="type-legend">${legend}</div>
  </div>`;
}

function renderDashboardCharts(chartData = {}) {
  return `<div class="dashboard-charts">
    <div class="chart-card">
      <div class="chart-title">上传趋势（近 30 天）</div>
      ${renderUploadTrend(chartData.uploadTrend)}
    </div>
    <div class="chart-card">
      <div class="chart-title">访问排行 TOP 10</div>
      ${renderHorizontalBars(chartData.visitRank, {
        valueKey: 'visitCount',
        emptyText: '暂无访问数据',
        formatter: (value) => `${value} 次`
      })}
    </div>
    <div class="chart-card">
      <div class="chart-title">文件类型分布</div>
      ${renderTypeDistribution(chartData.typeDistribution)}
    </div>
    <div class="chart-card">
      <div class="chart-title">存储占用 TOP 10</div>
      ${renderHorizontalBars(chartData.storageTop, {
        valueKey: 'sizeBytes',
        emptyText: '暂无存储数据',
        formatter: formatBytes
      })}
    </div>
  </div>`;
}

function dashboardPage({ sites, folders, totalCount, ungroupedCount, recentSites, chartData = {}, currentUser, csrfToken, baseUrl, settings, dataSize, diskStats }) {
  const totalFiles = sites.reduce((sum, site) => sum + Number(site.fileCount || 0), 0);
  const totalSize = sites.reduce((sum, site) => sum + Number(site.sizeBytes || 0), 0);

  const recentRows = recentSites.length === 0
    ? '<tr><td colspan="6" class="empty-cell">暂无站点，点击右上角“上传文件”开始。</td></tr>'
    : recentSites.map((site) => {
      const url = `${baseUrl}/sites/${site.id}/`;
      return `<tr>
        <td>
          <div class="file-cell">
            <div class="file-icon ${site.kind === 'zip' ? 'zip' : 'html'}">${fileKindIcon(site.kind)}</div>
            <div class="file-info">
              <span class="file-title">${escapeHtml(site.originalName)}</span>
              <span class="file-sub">${escapeHtml(site.id.slice(0, 8))} · ${escapeHtml(formatDate(site.createdAt))}</span>
            </div>
          </div>
        </td>
        <td><span class="tag">${escapeHtml(site.kind === 'zip' ? 'ZIP' : 'HTML')}</span></td>
        <td class="num">${escapeHtml(formatBytes(site.sizeBytes))}</td>
        <td class="num">${escapeHtml(site.visitCount || 0)}</td>
        <td class="muted">${escapeHtml(site.accessDays > 0 ? site.accessDays + ' 天' : '永久')}</td>
        <td class="muted">${escapeHtml(formatDate(site.createdAt))}</td>
      </tr>`;
    }).join('');

  return layout({
    title: '仪表',
    currentUser,
    csrfToken,
    activeNav: 'dashboard',
    settings,
    dataSize,
    diskStats,
    content: `
      <div class="page-head">
        <div>
          <div class="page-title">仪表</div>
          <div class="page-desc">系统运行概览，共 ${escapeHtml(totalCount)} 个站点在线</div>
        </div>
        <div class="head-actions">
          <a class="btn btn-primary" href="/admin/upload">${iconSvg('upload', 15)}上传文件</a>
        </div>
      </div>

      <div class="stats">
        ${statCard({ icon: 'sites', tone: 'blue', value: totalCount, label: '托管站点' })}
        ${statCard({ icon: 'folder', tone: 'green', value: folders.length, label: '文件夹' })}
        ${statCard({ icon: 'file', tone: 'orange', value: totalFiles, label: '文件数量' })}
        ${statCard({ icon: 'storage', tone: 'red', value: formatBytes(totalSize), label: '存储空间' })}
      </div>

      ${renderDashboardCharts(chartData)}

      <div class="panel">
        <div class="panel-bar">
          <div class="panel-title">最近上传</div>
          <div class="panel-meta"><a href="/admin?view=sites">查看全部 &raquo;</a></div>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>类型</th>
                <th style="text-align:right">大小</th>
                <th style="text-align:right">访问</th>
                <th>有效期</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>${recentRows}</tbody>
          </table>
        </div>
      </div>
    `
  });
}

module.exports = { dashboardPage };
