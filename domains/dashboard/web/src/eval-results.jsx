import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Segmented,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  FileTextOutlined,
  EyeOutlined,
  SearchOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;
export const conclusionLabels = { passed: '通过', failed: '未通过', incomplete: '未完成' };
export const evalPagination = {
  className: 'dashboard-eval-pagination',
  simple: { readOnly: true },
  hideOnSinglePage: true,
  showSizeChanger: false,
  locale: { prev_page: '上一页', next_page: '下一页' },
  showTotal: (total, [start, end]) => `${start}–${end} / 共 ${total} 条`,
  itemRender: (_page, type, element) => {
    if (type !== 'prev' && type !== 'next') return element;
    const label = type === 'prev' ? '上一页' : '下一页';
    return React.cloneElement(element, { 'aria-label': label, children: label });
  },
};
const qualityLabels = {
  included: '有效',
  flagged: '已标记风险',
  excluded: '已排除',
  unknown: '证据缺失',
};
export const numeric = (value, suffix = '') =>
  typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString()}${suffix}` : '—';
const cost = (value) => (typeof value === 'number' ? `$${value.toFixed(4)}` : '—');

export function Metric({ label, value, detail }) {
  return (
    <div className="dashboard-eval-metric">
      <Text type="secondary">{label}</Text>
      <Text strong>{value}</Text>
      {detail && <Text type="secondary">{detail}</Text>}
    </div>
  );
}

export function EvalRunProgress({ run }) {
  const active = !['completed', 'stopped', 'interrupted', 'unknown'].includes(run.executionStatus);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, run.id]);
  if (!active) return null;
  const progress = run.progress;
  const phase = progress?.phase ?? run.executionStatus;
  const index =
    { queued: 0, preparing: 0, generating: 0, running: 1, judging: 2, finalizing: 3 }[phase] ?? 0;
  const labels = {
    queued: '等待执行',
    preparing: '准备环境',
    generating: '生成用例',
    running: '执行用例',
    judging: '判定结果',
    finalizing: '生成报告',
    stopping: '正在停止',
  };
  const start = Date.parse(run.createdAt ?? '');
  const elapsed = Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 1000)) : null;
  const duration = elapsed === null ? '—' : `${Math.floor(elapsed / 60)} 分 ${elapsed % 60} 秒`;
  const completed = (run.cases ?? []).filter(
    (item) => item.passed !== null && item.passed !== undefined,
  ).length;
  const clock = (at) =>
    Number.isFinite(Date.parse(at ?? ''))
      ? new Date(at).toLocaleTimeString('zh-CN', { hour12: false })
      : '等待活动';
  const activities = progress?.activities ?? [];
  return (
    <section className="dashboard-eval-live" aria-label="实时评估进度">
      <div className="dashboard-eval-heading">
        <Space size={10}>
          <Text strong>评估进度</Text>
          <Tag color="processing">
            {run.executionStatus === 'stopping' ? '正在停止' : (labels[phase] ?? '执行中')}
          </Tag>
        </Space>
        <Text type="secondary">
          已用 {duration}
          {run.config.timeoutSeconds
            ? ` / ${Math.floor(run.config.timeoutSeconds / 60)} 分钟上限`
            : ''}
        </Text>
      </div>
      <Steps
        size="small"
        current={index}
        items={[
          { title: phase === 'generating' ? '生成用例' : '准备与用例' },
          { title: '执行用例' },
          { title: '判定结果' },
          { title: '生成报告' },
        ]}
      />
      <div className="dashboard-eval-live-facts">
        <div>
          <Text type="secondary">当前用例</Text>
          <Text strong>{progress?.currentCase?.task ?? run.config.task ?? '等待用例确定'}</Text>
          {progress?.currentCase && (
            <Text type="secondary">第 {progress.currentCase.repetition} 次重复</Text>
          )}
        </div>
        <div>
          <Text type="secondary">已结束用例</Text>
          <Text strong>
            {completed} / {run.expectedTotal ?? '—'}
          </Text>
        </div>
        <div>
          <Text type="secondary">最近活动</Text>
          <Text>{clock(progress?.lastEventAt ?? progress?.updatedAt)}</Text>
        </div>
      </div>
      {activities.length ? (
        <ol className="dashboard-eval-live-activities" aria-label="最近执行活动">
          {activities
            .slice(-3)
            .reverse()
            .map((item) => (
              <li key={item.id}>
                <time>{clock(item.at)}</time>
                <span>{item.message}</span>
              </li>
            ))}
        </ol>
      ) : (
        <Text type="secondary">尚未收到执行活动；阶段和用例结果会自动更新。</Text>
      )}
    </section>
  );
}

export function EvalSection({ title, description, extra, children, className = '' }) {
  return (
    <section className={`dashboard-eval-inner-section ${className}`}>
      <div className="dashboard-eval-section-heading">
        <div>
          <Title level={5}>{title}</Title>
          {description && <Text type="secondary">{description}</Text>}
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

function CaseStatus({ item }) {
  const abnormal = item.quality === 'excluded';
  return (
    <Tag
      color={
        abnormal
          ? 'warning'
          : item.passed === true
            ? 'success'
            : item.passed === false
              ? 'error'
              : 'default'
      }
    >
      {abnormal
        ? '执行异常'
        : item.passed === true
          ? '通过'
          : item.passed === false
            ? '未通过'
            : '未完成'}
    </Tag>
  );
}

function Facts({ items }) {
  return (
    <dl className="dashboard-eval-facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

function Scores({ scores, samples }) {
  return (
    <div className="dashboard-eval-score-grid">
      {Object.entries(scores).map(([name, score]) => (
        <div className="dashboard-eval-score-tile" key={name}>
          <div>
            <Text>{name}</Text>
            <Text className="dashboard-eval-numeric" strong>
              {Number(score).toFixed(2)}
            </Text>
          </div>
          <div className="dashboard-eval-score-track" aria-hidden="true">
            <span style={{ width: `${Math.max(0, Math.min(1, score)) * 100}%` }} />
          </div>
          {samples && <Text type="secondary">{samples[name]} 个有效分数</Text>}
        </div>
      ))}
    </div>
  );
}

export function EvalOverview({ run }) {
  const values = {};
  for (const item of (run.cases ?? []).filter(
    (item) => item.quality === 'included' || item.quality === 'flagged',
  ))
    for (const [key, value] of Object.entries(item.scores ?? {}))
      if (typeof value === 'number' && Number.isFinite(value)) (values[key] ??= []).push(value);
  const scores = Object.fromEntries(
    Object.entries(values).map(([key, items]) => [
      key,
      items.reduce((a, b) => a + b, 0) / items.length,
    ]),
  );
  const quality = (run.cases ?? []).reduce(
    (counts, item) => ({ ...counts, [item.quality]: (counts[item.quality] ?? 0) + 1 }),
    {},
  );
  const expected = run.expectedTotal ?? run.total;
  const metrics = run.metrics;
  return (
    <div className="dashboard-eval-stack">
      <div className="dashboard-eval-overview-grid">
        <Card className={`dashboard-eval-result-hero dashboard-eval-result-${run.conclusion}`}>
          <div className="dashboard-eval-result-heading">
            <Text className="dashboard-eval-section-label">评估结论</Text>
            <Tag>{run.executionStatus === 'completed' ? '执行已结束' : '以当前结果为准'}</Tag>
          </div>
          <div className="dashboard-eval-result-word">{conclusionLabels[run.conclusion]}</div>
          <Text type="secondary">任务检查决定结论；评分和执行证据用于解释结果。</Text>
          <div className="dashboard-eval-result-counts">
            <Metric label="通过用例" value={`${run.passed} / ${expected}`} />
            <Metric
              label="完整结果"
              value={run.total}
              detail={`预期 ${run.expectedTotal ?? '未知'} 个`}
            />
          </div>
        </Card>
        <Card className="dashboard-eval-resource-card" title="执行资源" size="small">
          <div className="dashboard-eval-resource-grid">
            <Metric label="用例耗时" value={numeric(metrics.durationSeconds)} detail="秒" />
            <Metric label="Tokens" value={numeric(metrics.tokens)} />
            <Metric
              label="已知用例费用"
              value={cost(metrics.knownCostUsd)}
              detail={
                metrics.costStatus === 'unavailable'
                  ? '未采集费用'
                  : metrics.costStatus === 'partial'
                    ? '仅部分用例费用，非完整总价'
                    : '仅用例费用，不含其他开销'
              }
            />
            <Metric label="生成阶段费用" value={cost(metrics.generationCostUsd)} />
          </div>
        </Card>
      </div>
      <div className="dashboard-eval-evidence-strip">
        <div>
          <Text className="dashboard-eval-section-label">样本质量</Text>
          <Space wrap>
            <span>{quality.included ?? 0} 有效</span>
            <span>{quality.flagged ?? 0} 已标记</span>
            <span>{quality.excluded ?? 0} 已排除</span>
            <span>{quality.unknown ?? 0} 证据缺失</span>
          </Space>
        </div>
        <div>
          <Text className="dashboard-eval-section-label">内容时效</Text>
          <Text type="secondary">
            {run.stale === true
              ? '对应旧内容'
              : run.stale === false
                ? '与当前内容一致'
                : '未核对当前目标内容'}
          </Text>
        </div>
      </div>
      {Object.keys(scores).length > 0 && (
        <EvalSection
          title="适用评分维度（0–1）"
          description="分数补充任务检查；查看用例证据确认判定原因。"
        >
          <Scores
            scores={scores}
            samples={Object.fromEntries(
              Object.entries(values).map(([key, items]) => [key, items.length]),
            )}
          />
        </EvalSection>
      )}
      {(quality.excluded ?? 0) > 0 && (
        <Alert
          type="warning"
          showIcon
          message="环境异常样本未纳入模型能力评分"
          description="结果不完整；请在用例详情中查看执行失败原因，修复环境后重新评估。"
        />
      )}
      {run.limitations?.length > 0 && (
        <EvalSection title="评估边界">
          <ul className="dashboard-eval-notes">
            {run.limitations.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </EvalSection>
      )}
    </div>
  );
}

export function EvalCases({ run, onSelect }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const cases = run.cases ?? [];
  const matches = {
    all: () => true,
    failed: (item) => item.passed === false && item.quality !== 'excluded',
    abnormal: (item) => item.quality === 'excluded',
  };
  const data = cases.filter(
    (item) =>
      matches[filter](item) &&
      `${item.task}\n${item.prompt ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <EvalSection
      title="用例结果"
      description="从结果进入输入、回答与检查证据。"
      extra={
        <Text type="secondary">
          {data.length} / {cases.length} 个结果
        </Text>
      }
    >
      <div className="dashboard-eval-case-toolbar">
        <Segmented
          aria-label="用例筛选"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: '全部用例' },
            { value: 'failed', label: '仅未通过' },
            { value: 'abnormal', label: '仅执行异常' },
          ]}
        />
        <Input
          aria-label="搜索用例"
          prefix={<SearchOutlined />}
          placeholder="搜索名称或输入…"
          allowClear
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <Table
        rowKey="id"
        size="small"
        pagination={{ ...evalPagination, pageSize: 10 }}
        dataSource={data}
        columns={[
          {
            title: '用例 / 输入',
            key: 'task',
            render: (_, item) => (
              <div className="dashboard-eval-case-name">
                <Button
                  className="dashboard-eval-target"
                  type="link"
                  onClick={() => onSelect(item)}
                >
                  {item.task}
                </Button>
                {item.prompt && (
                  <Text
                    className="dashboard-eval-case-excerpt"
                    type="secondary"
                    title={item.prompt}
                  >
                    {item.prompt}
                  </Text>
                )}
                <Text className="dashboard-eval-secondary" type="secondary">
                  {[
                    item.treatment,
                    typeof item.repetition === 'number' ? `第 ${item.repetition} 次` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </div>
            ),
          },
          {
            title: '判定',
            key: 'result',
            render: (_, item) => (
              <div className="dashboard-eval-case-name">
                <CaseStatus item={item} />
                <Text className="dashboard-eval-secondary" type="secondary">
                  {qualityLabels[item.quality]}
                </Text>
              </div>
            ),
          },
          {
            title: '检查摘要',
            key: 'check',
            responsive: ['lg'],
            render: (_, item) => (
              <Text className="dashboard-eval-case-excerpt" type="secondary">
                {item.checksFailed?.[0] ??
                  (item.checksPassed?.length
                    ? `${item.checksPassed.length} 项检查通过`
                    : '暂无检查证据')}
              </Text>
            ),
          },
          {
            title: '耗时',
            key: 'duration',
            responsive: ['md'],
            render: (_, item) => numeric(item.durationSeconds, ' 秒'),
          },
        ]}
        locale={{ emptyText: cases.length ? '没有符合筛选条件的用例' : '用例结果尚未生成' }}
      />
    </EvalSection>
  );
}

export function EvalCaseEvidence({ value, onArtifact }) {
  if (!value) return null;
  return (
    <div className="dashboard-eval-stack dashboard-eval-case-evidence">
      <div className="dashboard-eval-evidence-heading">
        <CaseStatus item={value} />
        <Text type="secondary">{value.model ?? '模型未采集'}</Text>
        <Text type="secondary">{numeric(value.durationSeconds, ' 秒')}</Text>
      </div>
      <div className="dashboard-eval-reading-grid">
        <EvalSection title="输入 / 指令">
          <pre className="dashboard-eval-reading">
            {value.prompt || '此记录未保存输入，请查看原始证据。'}
          </pre>
        </EvalSection>
        <EvalSection title="最终回答">
          <pre className="dashboard-eval-reading">
            {value.finalResponse || '未保存最终回答或执行尚未结束，请结合检查项与日志判断。'}
          </pre>
        </EvalSection>
      </div>
      <EvalSection
        title="失败检查项"
        extra={
          <Tag color={value.checksFailed?.length ? 'error' : 'default'}>
            {value.checksFailed?.length ?? 0} 项
          </Tag>
        }
      >
        <ul className="dashboard-eval-verdict-list dashboard-eval-verdict-failed">
          {value.checksFailed?.length ? (
            value.checksFailed.map((check, index) => (
              <li key={index}>
                <CloseCircleOutlined />
                <span>{check}</span>
              </li>
            ))
          ) : (
            <li>无失败检查项</li>
          )}
        </ul>
      </EvalSection>
      <EvalSection title="通过检查项与评分">
        <ul className="dashboard-eval-verdict-list">
          {value.checksPassed?.length ? (
            value.checksPassed.map((check, index) => (
              <li key={index}>
                <CheckCircleOutlined />
                <span>{check}</span>
              </li>
            ))
          ) : (
            <li className="dashboard-eval-muted">未记录通过检查项</li>
          )}
        </ul>
        {Object.values(value.scores ?? {}).some((score) => typeof score === 'number') && (
          <Scores
            scores={Object.fromEntries(
              Object.entries(value.scores).filter(
                ([, score]) => typeof score === 'number' && Number.isFinite(score),
              ),
            )}
          />
        )}
      </EvalSection>
      <EvalSection title="执行证据">
        <Facts
          items={[
            ['样本质量', qualityLabels[value.quality]],
            ['质量说明', value.qualityReason ?? '—'],
            ['实际模型', value.model ?? '—'],
            ['实际 Agent', value.agent ?? '—'],
            ['Tokens', numeric(value.tokens)],
            ['已知用例费用', cost(value.costUsd)],
          ]}
        />
        {value.failureAttribution?.length > 0 && (
          <ul className="dashboard-eval-notes">
            {value.failureAttribution.map((item, index) => (
              <li key={index}>
                <Text strong>{item.bucket}</Text> · {item.reason ?? item.check}
              </li>
            ))}
          </ul>
        )}
      </EvalSection>
      {value.artifacts?.length > 0 && (
        <EvalSection title="相关产物">
          <Space wrap>
            {value.artifacts.map((item) => (
              <Button key={item.id} icon={<FileTextOutlined />} onClick={() => onArtifact(item.id)}>
                {item.label}
              </Button>
            ))}
          </Space>
        </EvalSection>
      )}
    </div>
  );
}

function CoverageList({ values, missing = false }) {
  return values?.length ? (
    <ul
      className={`dashboard-eval-coverage-list ${missing ? 'dashboard-eval-coverage-missing' : ''}`}
    >
      {values.map((item) => (
        <li key={item}>
          {missing ? <span className="dashboard-eval-status-dot" /> : <CheckCircleOutlined />}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  ) : (
    <Text type="secondary">暂无证据</Text>
  );
}

export function EvalCoverage({ run }) {
  const coverage = run.coverage;
  if (!coverage) return <Empty description="实际 SDK 执行覆盖证据尚未生成" />;
  return (
    <div className="dashboard-eval-stack">
      <div className="dashboard-eval-evidence-strip dashboard-eval-coverage-summary">
        <Metric label="已覆盖步骤" value={coverage.coveredSteps?.length ?? 0} />
        <Metric label="未覆盖步骤" value={coverage.uncoveredSteps?.length ?? 0} />
        <Metric label="未覆盖决策" value={coverage.uncoveredChoices?.length ?? 0} />
      </div>
      <Alert type="info" showIcon message="少量用例通过不代表完整验收，请同时检查未覆盖路径" />
      <EvalSection
        title="实际执行步骤"
        description="实际执行与验证覆盖分别记录，执行过的步骤仍可能缺少验证。"
      >
        <div className="dashboard-eval-step-path">
          {coverage.executedSteps?.length ? (
            coverage.executedSteps.map((step) => (
              <div key={step}>
                <span>执行</span>
                <Text>{step}</Text>
              </div>
            ))
          ) : (
            <Text type="secondary">暂无证据</Text>
          )}
        </div>
      </EvalSection>
      <div className="dashboard-eval-detail-grid">
        <Card title="步骤覆盖" size="small">
          <div className="dashboard-eval-coverage-pair">
            <EvalSection title="已覆盖步骤">
              <CoverageList values={coverage.coveredSteps} />
            </EvalSection>
            <EvalSection title="未覆盖步骤">
              <CoverageList values={coverage.uncoveredSteps} missing />
            </EvalSection>
          </div>
        </Card>
        <Card title="决策覆盖" size="small">
          <div className="dashboard-eval-coverage-pair">
            <EvalSection title="已覆盖决策">
              <CoverageList values={coverage.coveredChoices} />
            </EvalSection>
            <EvalSection title="未覆盖决策">
              <CoverageList values={coverage.uncoveredChoices} missing />
            </EvalSection>
          </div>
        </Card>
      </div>
      <EvalSection title="恢复行为">
        <CoverageList values={coverage.recoveredActions} />
      </EvalSection>
      <Text type="secondary">实际模型：{coverage.actualModels?.join('、') || '未采集'}</Text>
    </div>
  );
}

export function EvalConfiguration({ run }) {
  const config = run.config;
  return (
    <div className="dashboard-eval-stack">
      <EvalSection
        title="运行快照"
        description="这里记录本次执行使用的配置；重新评估时可修改配置。"
      >
        <div className="dashboard-eval-detail-grid">
          <Card size="small" title="目标与参照">
            <Facts
              items={[
                ['目标路径', run.target.path ?? '旧记录未保存'],
                [
                  '内容身份',
                  <Text className="dashboard-eval-hash" code>
                    {run.target.contentHash ?? '未保存'}
                  </Text>,
                ],
                ['启动时绑定基线', run.boundBaselineRunId ?? '未绑定或旧记录未保存'],
              ]}
            />
          </Card>
          <Card size="small" title="执行与判定">
            <Facts
              items={[
                ['执行 Agent / 模型', `${config.agent ?? '—'} / ${config.model ?? '—'}`],
                ['执行端点', config.baseUrl ?? '由运行环境提供'],
                [
                  '独立 Judge',
                  config.judgeModel
                    ? `${config.judgeAgent ?? '默认 Agent'} / ${config.judgeModel}`
                    : '未配置或旧记录未保存',
                ],
                ['Judge 端点', config.judgeBaseUrl ?? '由运行环境提供'],
              ]}
            />
          </Card>
          <Card size="small" title="执行限制">
            <Facts
              items={[
                ['评估总时限', numeric(config.timeoutSeconds, ' 秒')],
                ['最大执行轮数', numeric(config.maxTurns, ' 轮')],
                ['评估 Profile', config.profile ?? '沿用目标配置'],
              ]}
            />
          </Card>
          <Card size="small" title="报告与凭据">
            <Facts
              items={[
                ['报告去向', config.suite ?? 'local'],
                ['凭据', '由运行环境提供，不写入运行快照或浏览器缓存'],
              ]}
            />
          </Card>
        </div>
      </EvalSection>
    </div>
  );
}

export function EvalArtifacts({ run, downloads, onOpen, onDownload }) {
  const descriptions = {
    markdown: 'Markdown 报告 · 可阅读与编辑',
    html: 'HTML 报告 · 浏览器预览',
    json: '结构化数据 · JSON',
  };
  return (
    <EvalSection
      title="日志与产物"
      description="预览执行证据，或下载文件留存与分享。"
      extra={<Text type="secondary">{run.artifacts?.length ?? 0} 个文件</Text>}
    >
      {run.artifacts?.length ? (
        <div className="dashboard-eval-file-list">
          {run.artifacts.map((item) => (
            <div className="dashboard-eval-file-row" key={item.id}>
              <div className="dashboard-eval-file-icon">
                <FileTextOutlined />
              </div>
              <div className="dashboard-eval-file-name">
                <Button
                  className="dashboard-eval-target"
                  type="link"
                  aria-label={item.label}
                  onClick={() => onOpen(item.id)}
                >
                  {item.label}
                </Button>
                <Text type="secondary">{descriptions[item.format] ?? '执行日志与证据文件'}</Text>
              </div>
              <Space size={8} className="dashboard-eval-file-actions">
                <Button
                  type="link"
                  icon={<EyeOutlined />}
                  aria-label={`预览产物 ${item.label}`}
                  onClick={() => onOpen(item.id)}
                >
                  预览
                </Button>
                <Button
                  type="link"
                  icon={<DownloadOutlined />}
                  aria-label={`下载产物 ${item.label}`}
                  loading={downloads.includes(`${run.id}/${item.id}`)}
                  onClick={() => onDownload(item.id)}
                >
                  下载
                </Button>
              </Space>
            </div>
          ))}
        </div>
      ) : (
        <Empty description="产物尚未生成" />
      )}
      <Text className="dashboard-eval-footnote" type="secondary">
        日志在独立后台进程中记录，离开页面不会停止评估。
      </Text>
    </EvalSection>
  );
}

const settingLabels = {
  agent: '执行 Agent',
  model: '执行模型',
  baseUrl: '执行端点',
  judgeEnabled: '启用独立 Judge',
  judgeAgent: 'Judge Agent',
  judgeModel: 'Judge 模型',
  judgeBaseUrl: 'Judge 端点',
  suite: '报告去向',
  profile: '评估配置',
  quick: '快速冒烟',
  task: '指定用例',
  timeoutSeconds: '超时（秒）',
  maxTurns: '最大执行轮数',
  contentHash: '内容快照',
  version: '内容版本',
};
export function EvalComparison({ value }) {
  if (!value) return <Empty description="选择有效基线后查看对比" />;
  return (
    <div className="dashboard-eval-stack">
      {!value.comparable && (
        <Alert
          type="warning"
          showIcon
          message="当前结果不满足可比条件"
          description={value.reasons.join('\n')}
        />
      )}
      <div className="dashboard-eval-comparison-summary">
        <Metric
          label="基线通过"
          value={`${value.baseline.passed} / ${value.baseline.expectedTotal ?? value.baseline.total}`}
        />
        <Metric
          label="本次通过"
          value={`${value.candidate.passed} / ${value.candidate.expectedTotal ?? value.candidate.total}`}
        />
        <Metric
          label="用例变化"
          value={value.comparable ? `${value.improved} / ${value.regressed}` : '仅并列查看'}
          detail={value.comparable ? '进步 / 退步' : undefined}
        />
      </div>
      <EvalSection title="逐项对比" description="同一固定用例的基线结果与本次结果。">
        <Table
          size="small"
          rowKey={(item) => `${item.task}-${item.repetition}`}
          pagination={false}
          dataSource={value.cases}
          columns={[
            { title: '用例', dataIndex: 'task' },
            {
              title: '基线',
              dataIndex: 'baseline',
              render: (item) =>
                typeof item === 'boolean' ? <CaseStatus item={{ passed: item }} /> : '—',
            },
            {
              title: '本次',
              dataIndex: 'candidate',
              render: (item) =>
                typeof item === 'boolean' ? <CaseStatus item={{ passed: item }} /> : '—',
            },
            {
              title: '变化',
              dataIndex: 'change',
              render: (item) => (
                <Tag
                  color={
                    item === 'improved' ? 'success' : item === 'regressed' ? 'error' : 'default'
                  }
                >
                  {
                    { improved: '进步', regressed: '退步', unchanged: '持平', unmatched: '未配对' }[
                      item
                    ]
                  }
                </Tag>
              ),
            },
          ]}
        />
      </EvalSection>
      {value.configurationChanges.length > 0 && (
        <EvalSection
          title="配置差异"
          description="模型或执行配置同时变化时，结果不能单独归因于内容升级。"
        >
          <Table
            size="small"
            rowKey="field"
            pagination={false}
            dataSource={value.configurationChanges}
            columns={[
              {
                title: '设置',
                dataIndex: 'field',
                width: 96,
                render: (field) => settingLabels[field] ?? field,
              },
              { title: '基线', dataIndex: 'baseline', render: (item) => String(item ?? '—') },
              { title: '本次', dataIndex: 'candidate', render: (item) => String(item ?? '—') },
            ]}
          />
        </EvalSection>
      )}
      <EvalSection title="资源对比">
        <Facts
          items={[
            [
              '已知费用（基线 / 本次）',
              `${cost(value.baseline.metrics.knownCostUsd)} / ${cost(value.candidate.metrics.knownCostUsd)}`,
            ],
            [
              '用例耗时（基线 / 本次）',
              `${numeric(value.baseline.metrics.durationSeconds, ' 秒')} / ${numeric(value.candidate.metrics.durationSeconds, ' 秒')}`,
            ],
          ]}
        />
      </EvalSection>
    </div>
  );
}
