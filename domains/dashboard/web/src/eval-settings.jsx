import React, { useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import './eval-panel.css';
import { evalDisplayError } from './eval-guidance.jsx';
const { Text, Title } = Typography;
const endpoint = '/api/dashboard/eval/settings';
const agents = ['claude-code', 'codex', 'qoder', 'codebuddy'].map((value) => ({
  value,
  label: value,
}));
async function request(path = '', body, signal) {
  const response = await fetch(endpoint + path, {
    cache: 'no-store',
    signal,
    ...(body !== undefined
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? 'Eval 设置请求失败');
  if (
    path !== '/check' &&
    (!value.defaults ||
      !value.credentials?.main ||
      !value.credentials?.judge ||
      typeof value.revision !== 'string' ||
      !Array.isArray(value.overrides))
  )
    throw new Error('Eval 设置响应无效，请刷新或升级 Dashboard');
  return value;
}
export function EvalSettings({ readOnly = false, onSaved }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const [checks, setChecks] = useState(null);
  const [clearMain, setClearMain] = useState(false);
  const [clearJudge, setClearJudge] = useState(false);
  const [reload, setReload] = useState(0);
  const [dirty, setDirty] = useState(false);
  const judgeEnabled = Form.useWatch('judgeEnabled', form);
  const agent = Form.useWatch('agent', form);
  const apply = (value) => {
    setData(value);
    form.resetFields();
    form.setFieldsValue({
      ...value.defaults,
      mainKind: value.credentials.main.kind,
      judgeKind: value.credentials.judge.kind,
    });
    setClearMain(false);
    setClearJudge(false);
    setDirty(false);
    setChecks(null);
  };
  useEffect(() => {
    if (readOnly) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void request('', undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) apply(value);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [readOnly, reload]);
  const save = async () => {
    if (saving || loading) return;
    setSaving(true);
    setError(null);
    try {
      await form.validateFields();
      const values = form.getFieldsValue(true);
      const defaults = Object.fromEntries(
        Object.keys(data.defaults).map((key) => [key, values[key] ?? data.defaults[key]]),
      );
      const credentials = {};
      for (const [slot, field, kind, clear] of [
        ['main', 'mainCredential', 'mainKind', clearMain],
        ['judge', 'judgeCredential', 'judgeKind', clearJudge],
      ]) {
        if (clear) credentials[slot] = null;
        else if (values[field]?.trim())
          credentials[slot] = { value: values[field].trim(), kind: values[kind] ?? 'api-key' };
      }
      const next = await request('', { expectedRevision: data.revision, defaults, credentials });
      apply(next);
      onSaved?.();
      message.success('Eval 设置已保存');
    } catch (err) {
      if (!err.errorFields) setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  const credential = (slot) => {
    const main = slot === 'main';
    const status = data?.credentials[slot];
    const clear = main ? clearMain : clearJudge;
    const setClear = main ? setClearMain : setClearJudge;
    const field = main ? 'mainCredential' : 'judgeCredential';
    return (
      <div className="dashboard-eval-settings-credential">
        <div className="dashboard-eval-heading">
          <Text strong>{main ? '执行凭据' : 'Judge 凭据'}</Text>
          <Tag color={clear ? 'warning' : status?.configured ? 'success' : 'default'}>
            {clear
              ? '待移除'
              : status?.configured
                ? status.source === 'environment'
                  ? '由启动环境提供'
                  : '已配置'
                : '未配置'}
          </Tag>
        </div>
        <div className="dashboard-eval-form-grid">
          <Form.Item
            label={main ? '执行凭据类型' : 'Judge 凭据类型'}
            name={main ? 'mainKind' : 'judgeKind'}
          >
            <Select
              options={[
                { value: 'api-key', label: 'API key' },
                ...(!main || ['claude-code', 'codebuddy'].includes(agent)
                  ? [{ value: 'auth-token', label: 'Auth token' }]
                  : []),
              ]}
            />
          </Form.Item>
          <Form.Item label={main ? '新的执行凭据' : '新的 Judge 凭据'} name={field}>
            <Input.Password
              autoComplete="off"
              placeholder={status?.configured ? '留空保留已有凭据' : '输入凭据'}
              disabled={clear}
            />
          </Form.Item>
        </div>
        {status?.saved && (
          <Button
            type="text"
            danger={!clear}
            disabled={saving}
            onClick={() => {
              setClear(!clear);
              form.setFieldValue(field, '');
              setDirty(true);
            }}
          >
            {clear
              ? main
                ? '撤销移除执行凭据'
                : '撤销移除 Judge 凭据'
              : main
                ? '移除已保存执行凭据'
                : '移除已保存 Judge 凭据'}
          </Button>
        )}
        {clear && (
          <Text type="secondary">保存后移除本机用户配置中的凭据；启动环境中的值保持有效。</Text>
        )}
      </div>
    );
  };
  if (readOnly) return <Alert type="info" showIcon message="Eval 设置仅在本地 Dashboard 中提供" />;
  return (
    <div className="dashboard-eval-page dashboard-eval-settings" aria-label="Eval 设置">
      <div className="dashboard-eval-heading">
        <div>
          <Title level={4}>Eval</Title>
          <Text type="secondary">本机用户级配置，供所有项目复用。新建评估可覆盖默认值。</Text>
        </div>
        <Space wrap>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            aria-label="保存 Eval 设置"
            disabled={loading || !data}
            loading={saving}
            onClick={() => void save()}
          >
            保存 Eval 设置
          </Button>
          <Button
            icon={<ReloadOutlined />}
            disabled={loading || saving}
            onClick={() => setReload((value) => value + 1)}
          >
            重新读取设置
          </Button>
        </Space>
      </div>
      {error && <Alert type="error" showIcon message="Eval 设置需要调整" description={error} />}
      {data?.warnings?.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="已有配置需要调整"
          description={data.warnings.join('\n')}
        />
      )}
      <Spin spinning={loading}>
        {data && (
          <Form
            name="eval-user-settings"
            form={form}
            layout="vertical"
            onValuesChange={() => {
              setDirty(true);
              setError(null);
            }}
          >
            <Card title="默认执行模型" size="small">
              <div className="dashboard-eval-form-grid">
                <Form.Item label="默认执行 Agent" name="agent" rules={[{ required: true }]}>
                  <Select options={agents} />
                </Form.Item>
                <Form.Item label="默认执行模型" name="model">
                  <Input placeholder="留空沿用目标或启动环境" />
                </Form.Item>
              </div>
              <Form.Item label="默认执行端点" name="baseUrl">
                <Input placeholder="https://provider.example/v1，留空使用默认端点" />
              </Form.Item>
              {credential('main')}
            </Card>
            <Card title="独立 Judge" size="small">
              <Form.Item name="judgeEnabled" valuePropName="checked">
                <Checkbox>默认启用独立 Judge</Checkbox>
              </Form.Item>
              {judgeEnabled && (
                <>
                  <div className="dashboard-eval-form-grid">
                    <Form.Item
                      label="默认 Judge Agent"
                      name="judgeAgent"
                      rules={[{ required: true }]}
                    >
                      <Select options={agents} />
                    </Form.Item>
                    <Form.Item
                      label="默认 Judge 模型"
                      name="judgeModel"
                      rules={[{ required: true, message: '请填写 Judge 模型' }]}
                    >
                      <Input />
                    </Form.Item>
                  </div>
                  <Form.Item label="默认 Judge 端点" name="judgeBaseUrl">
                    <Input placeholder="留空使用默认端点" />
                  </Form.Item>
                </>
              )}
              {credential('judge')}
            </Card>
            <Card title="默认执行预算" size="small">
              <div className="dashboard-eval-detail-grid">
                {[
                  ['Skill', 'skill', 86400, 200],
                  ['SDK 应用', 'application', 3600, 32],
                ].map(([title, prefix, seconds, turns]) => (
                  <div key={prefix}>
                    <Text strong>{title}</Text>
                    <Form.Item label={`${title} 默认总时限（秒）`} name={`${prefix}TimeoutSeconds`}>
                      <InputNumber min={30} max={seconds} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item label={`${title} 默认最大轮数`} name={`${prefix}MaxTurns`}>
                      <InputNumber min={1} max={turns} style={{ width: '100%' }} />
                    </Form.Item>
                  </div>
                ))}
              </div>
            </Card>
            {data.overrides.length > 0 && (
              <Alert
                type="info"
                showIcon
                message="启动环境优先于用户配置"
                description={`${data.overrides.join('、')}由 Dashboard 的启动环境提供。保存不会修改这些环境变量；需要调整时，更改启动环境后重启 Dashboard。`}
              />
            )}
            <div className="dashboard-eval-heading">
              <Text type="secondary">
                {dirty ? '有未保存的更改' : '已有凭据不会回显，也不会保存到浏览器缓存。'}
              </Text>
              <Space wrap>
                <Button
                  loading={checking}
                  disabled={saving || dirty}
                  onClick={async () => {
                    setChecking(true);
                    setError(null);
                    try {
                      setChecks(await request('/check', {}));
                    } catch (err) {
                      setError(err.message);
                    } finally {
                      setChecking(false);
                    }
                  }}
                >
                  检查本地环境
                </Button>
              </Space>
            </div>
            {checks && (
              <Card title="本地环境检查" size="small">
                <div className="dashboard-eval-checks">
                  {checks.environment.map((check) => (
                    <div key={check.id}>
                      <Tag
                        color={
                          check.status === 'available'
                            ? 'success'
                            : check.status === 'missing'
                              ? 'error'
                              : 'default'
                        }
                      >
                        {check.label}
                      </Tag>
                      <Text>{evalDisplayError(check.detail)}</Text>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <Text className="dashboard-eval-settings-path" type="secondary">
              配置保存在本机用户目录：{data.path}。保存和本地环境检查均不会调用模型。
            </Text>
          </Form>
        )}
      </Spin>
    </div>
  );
}
