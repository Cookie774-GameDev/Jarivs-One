//! Closed, typed broker contract for the small SiYuan API subset approved for Phase 1.

use super::security::{validate_runtime_token, LOOPBACK_HOST};
use reqwest::blocking::Client;
use reqwest::redirect::Policy;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::{json, Value};
use std::fmt;
use std::io::Read;
use std::sync::Mutex;
use std::time::Duration;

pub const MAX_IDENTIFIER_BYTES: usize = 128;
pub const MAX_QUERY_BYTES: usize = 512;
pub const MAX_SEARCH_RESULTS: u16 = 100;
pub const MAX_BLOCK_CONTENT_BYTES: usize = 1_048_576;
const MAX_HTTP_RESPONSE_BYTES: u64 = 1_100_000;
const HTTP_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub feature_enabled: bool,
    pub state: String,
    pub runtime_bundled: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeVersion {
    pub version: String,
    pub commit: String,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Notebook {
    pub id: String,
    pub name: String,
    pub closed: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockSummary {
    pub id: String,
    pub notebook_id: String,
    pub path: String,
    pub content: String,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Block {
    pub id: String,
    pub notebook_id: String,
    pub path: String,
    pub markdown: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BrokerRequest<'a> {
    Status,
    ListNotebooks,
    SearchBlocks { query: &'a str, limit: u16 },
    GetBlock { id: &'a str },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BrokerResponse {
    Status(RuntimeStatus),
    Notebooks(Vec<Notebook>),
    SearchResults(Vec<BlockSummary>),
    Block(Block),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClientError {
    FeatureDisabled,
    InvalidIdentifier,
    InvalidQuery,
    InvalidLimit,
    ResponseTooLarge,
    ResponseTypeMismatch,
    TransportUnavailable,
}

impl std::fmt::Display for ClientError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::FeatureDisabled => "siyuan_feature_disabled",
            Self::InvalidIdentifier => "siyuan_identifier_invalid",
            Self::InvalidQuery => "siyuan_query_invalid",
            Self::InvalidLimit => "siyuan_limit_invalid",
            Self::ResponseTooLarge => "siyuan_response_too_large",
            Self::ResponseTypeMismatch => "siyuan_response_type_mismatch",
            Self::TransportUnavailable => "siyuan_transport_unavailable",
        })
    }
}

pub(crate) struct HttpSiyuanTransport {
    client: Client,
    base_url: String,
    token: String,
    session_cookie: Mutex<Option<String>>,
}

impl fmt::Debug for HttpSiyuanTransport {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("HttpSiyuanTransport")
            .field("base_url", &self.base_url)
            .field("token", &"[REDACTED]")
            .field("session_cookie", &"[REDACTED]")
            .finish()
    }
}

#[derive(Deserialize)]
struct ApiEnvelope<T> {
    code: i64,
    data: T,
}

#[derive(Deserialize)]
struct NotebookData {
    notebooks: Vec<NotebookWire>,
}

#[derive(Deserialize)]
struct NotebookWire {
    id: String,
    name: String,
    closed: bool,
}

#[derive(Deserialize)]
struct SearchData {
    blocks: Vec<SearchBlockWire>,
}

#[derive(Deserialize)]
struct SearchBlockWire {
    id: String,
    #[serde(rename = "box")]
    notebook_id: String,
    path: String,
    content: String,
}

#[derive(Deserialize)]
struct BlockInfoData {
    #[serde(rename = "box")]
    notebook_id: String,
    path: String,
}

#[derive(Deserialize)]
struct BlockKramdownData {
    id: String,
    kramdown: String,
}

impl HttpSiyuanTransport {
    pub(crate) fn new(port: u16, token: String) -> Result<Self, ClientError> {
        if port == 0 || validate_runtime_token(&token).is_err() {
            return Err(ClientError::TransportUnavailable);
        }
        let client = Client::builder()
            .redirect(Policy::none())
            .timeout(HTTP_TIMEOUT)
            .build()
            .map_err(|_| ClientError::TransportUnavailable)?;
        Ok(Self {
            client,
            base_url: format!("http://{LOOPBACK_HOST}:{port}"),
            token,
            session_cookie: Mutex::new(None),
        })
    }

    fn read_envelope<T: DeserializeOwned>(
        &self,
        mut response: reqwest::blocking::Response,
    ) -> Result<T, ClientError> {
        if !response.status().is_success()
            || response
                .content_length()
                .is_some_and(|length| length > MAX_HTTP_RESPONSE_BYTES)
        {
            return Err(ClientError::TransportUnavailable);
        }
        let mut bytes = Vec::new();
        response
            .by_ref()
            .take(MAX_HTTP_RESPONSE_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| ClientError::TransportUnavailable)?;
        if bytes.len() as u64 > MAX_HTTP_RESPONSE_BYTES {
            return Err(ClientError::ResponseTooLarge);
        }
        let envelope: ApiEnvelope<T> =
            serde_json::from_slice(&bytes).map_err(|_| ClientError::ResponseTypeMismatch)?;
        if envelope.code != 0 {
            return Err(ClientError::TransportUnavailable);
        }
        Ok(envelope.data)
    }

    fn ensure_authenticated(&self) -> Result<String, ClientError> {
        let mut session_cookie = self
            .session_cookie
            .lock()
            .map_err(|_| ClientError::TransportUnavailable)?;
        if let Some(cookie) = session_cookie.as_ref() {
            return Ok(cookie.clone());
        }

        let response = self
            .client
            .post(format!("{}/api/system/loginAuth", self.base_url))
            .json(&json!({
                "authCode": self.token,
                "captcha": "",
                "rememberMe": false,
            }))
            .send()
            .map_err(|_| ClientError::TransportUnavailable)?;
        let cookie = response
            .headers()
            .get(reqwest::header::SET_COOKIE)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(';').next())
            .filter(|value| value.starts_with("siyuan=") && value.len() <= 4_096)
            .ok_or(ClientError::TransportUnavailable)?
            .to_owned();
        let _: Value = self.read_envelope(response)?;
        *session_cookie = Some(cookie.clone());
        Ok(cookie)
    }

    fn post<T: DeserializeOwned>(&self, path: &'static str, body: Value) -> Result<T, ClientError> {
        let session_cookie = self.ensure_authenticated()?;
        let response = self
            .client
            .post(format!("{}{path}", self.base_url))
            .header(reqwest::header::COOKIE, session_cookie)
            .json(&body)
            .send()
            .map_err(|_| ClientError::TransportUnavailable)?;
        self.read_envelope(response)
    }

    fn runtime_version(&self) -> Result<String, ClientError> {
        self.post("/api/system/version", json!({}))
    }

    fn notebooks(&self) -> Result<Vec<Notebook>, ClientError> {
        let data: NotebookData = self.post("/api/notebook/lsNotebooks", json!({}))?;
        if data.notebooks.len() > 1_000 {
            return Err(ClientError::ResponseTooLarge);
        }
        data.notebooks
            .into_iter()
            .map(|notebook| {
                validate_identifier(&notebook.id)?;
                if notebook.name.is_empty() || notebook.name.len() > 256 {
                    return Err(ClientError::ResponseTooLarge);
                }
                Ok(Notebook {
                    id: notebook.id,
                    name: notebook.name,
                    closed: notebook.closed,
                })
            })
            .collect()
    }

    fn search(&self, query: &str, limit: u16) -> Result<Vec<BlockSummary>, ClientError> {
        let data: SearchData = self.post(
            "/api/search/fullTextSearchBlock",
            json!({
                "query": query,
                "page": 1,
                "pageSize": limit,
                "method": 0,
            }),
        )?;
        if data.blocks.len() > usize::from(limit) {
            return Err(ClientError::ResponseTooLarge);
        }
        data.blocks
            .into_iter()
            .map(|block| {
                validate_identifier(&block.id)?;
                validate_identifier(&block.notebook_id)?;
                if block.path.len() > 4_096 || block.content.len() > MAX_BLOCK_CONTENT_BYTES {
                    return Err(ClientError::ResponseTooLarge);
                }
                Ok(BlockSummary {
                    id: block.id,
                    notebook_id: block.notebook_id,
                    path: block.path,
                    content: block.content,
                })
            })
            .collect()
    }

    fn block(&self, id: &str) -> Result<Block, ClientError> {
        let info: BlockInfoData = self.post("/api/block/getBlockInfo", json!({ "id": id }))?;
        let content: BlockKramdownData =
            self.post("/api/block/getBlockKramdown", json!({ "id": id }))?;
        if content.id != id {
            return Err(ClientError::ResponseTypeMismatch);
        }
        validate_identifier(&info.notebook_id)?;
        if info.path.len() > 4_096 || content.kramdown.len() > MAX_BLOCK_CONTENT_BYTES {
            return Err(ClientError::ResponseTooLarge);
        }
        Ok(Block {
            id: content.id,
            notebook_id: info.notebook_id,
            path: info.path,
            markdown: content.kramdown,
        })
    }
}

impl SiyuanTransport for HttpSiyuanTransport {
    fn send(&self, request: BrokerRequest<'_>) -> Result<BrokerResponse, ClientError> {
        match request {
            BrokerRequest::Status => self.runtime_version().map(|_| {
                BrokerResponse::Status(RuntimeStatus {
                    feature_enabled: true,
                    runtime_bundled: true,
                    state: "ready".to_owned(),
                })
            }),
            BrokerRequest::ListNotebooks => self.notebooks().map(BrokerResponse::Notebooks),
            BrokerRequest::SearchBlocks { query, limit } => {
                self.search(query, limit).map(BrokerResponse::SearchResults)
            }
            BrokerRequest::GetBlock { id } => self.block(id).map(BrokerResponse::Block),
        }
    }
}

pub trait SiyuanTransport {
    fn send(&self, request: BrokerRequest<'_>) -> Result<BrokerResponse, ClientError>;
}

pub struct SiyuanClient<T> {
    feature_enabled: bool,
    transport: T,
}

impl<T: SiyuanTransport> SiyuanClient<T> {
    pub fn new(feature_enabled: bool, transport: T) -> Self {
        Self {
            feature_enabled,
            transport,
        }
    }

    fn require_enabled(&self) -> Result<(), ClientError> {
        if self.feature_enabled {
            Ok(())
        } else {
            Err(ClientError::FeatureDisabled)
        }
    }

    pub fn status(&self) -> Result<RuntimeStatus, ClientError> {
        self.require_enabled()?;
        match self.transport.send(BrokerRequest::Status)? {
            BrokerResponse::Status(status) => Ok(status),
            _ => Err(ClientError::ResponseTypeMismatch),
        }
    }

    pub fn list_notebooks(&self) -> Result<Vec<Notebook>, ClientError> {
        self.require_enabled()?;
        match self.transport.send(BrokerRequest::ListNotebooks)? {
            BrokerResponse::Notebooks(notebooks) => Ok(notebooks),
            _ => Err(ClientError::ResponseTypeMismatch),
        }
    }

    pub fn search_blocks(&self, query: &str, limit: u16) -> Result<Vec<BlockSummary>, ClientError> {
        self.require_enabled()?;
        validate_query(query)?;
        if limit == 0 || limit > MAX_SEARCH_RESULTS {
            return Err(ClientError::InvalidLimit);
        }
        match self
            .transport
            .send(BrokerRequest::SearchBlocks { query, limit })?
        {
            BrokerResponse::SearchResults(results) => {
                if results.len() > usize::from(limit)
                    || results
                        .iter()
                        .any(|block| block.content.len() > MAX_BLOCK_CONTENT_BYTES)
                {
                    Err(ClientError::ResponseTooLarge)
                } else {
                    Ok(results)
                }
            }
            _ => Err(ClientError::ResponseTypeMismatch),
        }
    }

    pub fn get_block(&self, id: &str) -> Result<Block, ClientError> {
        self.require_enabled()?;
        validate_identifier(id)?;
        match self.transport.send(BrokerRequest::GetBlock { id })? {
            BrokerResponse::Block(block) if block.markdown.len() <= MAX_BLOCK_CONTENT_BYTES => {
                Ok(block)
            }
            BrokerResponse::Block(_) => Err(ClientError::ResponseTooLarge),
            _ => Err(ClientError::ResponseTypeMismatch),
        }
    }
}

fn validate_identifier(value: &str) -> Result<(), ClientError> {
    if value.is_empty()
        || value.len() > MAX_IDENTIFIER_BYTES
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        Err(ClientError::InvalidIdentifier)
    } else {
        Ok(())
    }
}

fn validate_query(value: &str) -> Result<(), ClientError> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.len() > MAX_QUERY_BYTES
        || trimmed.chars().any(char::is_control)
    {
        Err(ClientError::InvalidQuery)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::sync::mpsc::{self, Receiver};
    use std::thread::JoinHandle;

    struct MockTransport {
        requests: RefCell<Vec<String>>,
        response: BrokerResponse,
    }

    impl MockTransport {
        fn new(response: BrokerResponse) -> Self {
            Self {
                requests: RefCell::new(Vec::new()),
                response,
            }
        }
    }

    impl SiyuanTransport for MockTransport {
        fn send(&self, request: BrokerRequest<'_>) -> Result<BrokerResponse, ClientError> {
            let request = match request {
                BrokerRequest::Status => "status".to_owned(),
                BrokerRequest::ListNotebooks => "list_notebooks".to_owned(),
                BrokerRequest::SearchBlocks { query, limit } => format!("search:{query}:{limit}"),
                BrokerRequest::GetBlock { id } => format!("get:{id}"),
            };
            self.requests.borrow_mut().push(request);
            Ok(self.response.clone())
        }
    }

    fn mock_http_server(responses: Vec<String>) -> (u16, Receiver<String>, JoinHandle<()>) {
        let listener = TcpListener::bind((LOOPBACK_HOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let (sender, receiver) = mpsc::channel();
        let handle = std::thread::spawn(move || {
            for response_body in responses {
                let (mut stream, _) = listener.accept().unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut request = String::new();
                let mut content_length = 0_usize;
                loop {
                    let mut line = String::new();
                    reader.read_line(&mut line).unwrap();
                    if line == "\r\n" || line.is_empty() {
                        break;
                    }
                    if let Some(length) = line.to_ascii_lowercase().strip_prefix("content-length: ")
                    {
                        content_length = length.trim().parse().unwrap();
                    }
                    request.push_str(&line);
                }
                let mut body = vec![0_u8; content_length];
                reader.read_exact(&mut body).unwrap();
                request.push_str(&String::from_utf8(body).unwrap());
                sender.send(request).unwrap();
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nSet-Cookie: siyuan=vibespace-native-session; Path=/; HttpOnly; SameSite=Lax\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    response_body.len(),
                    response_body
                )
                .unwrap();
            }
        });
        (port, receiver, handle)
    }

    #[test]
    fn disabled_client_never_reaches_transport() {
        let transport = MockTransport::new(BrokerResponse::Status(RuntimeStatus {
            feature_enabled: true,
            state: "ready".to_owned(),
            runtime_bundled: true,
        }));
        let client = SiyuanClient::new(false, transport);
        assert_eq!(client.status(), Err(ClientError::FeatureDisabled));
        assert!(client.transport.requests.borrow().is_empty());
    }

    #[test]
    fn typed_search_emits_only_the_closed_broker_request() {
        let transport = MockTransport::new(BrokerResponse::SearchResults(vec![BlockSummary {
            id: "block-1".to_owned(),
            notebook_id: "notebook-1".to_owned(),
            path: "/spec".to_owned(),
            content: "Pinned v3.8.1".to_owned(),
        }]));
        let client = SiyuanClient::new(true, transport);
        let result = client
            .search_blocks("pinned", 10)
            .expect("typed search response");
        assert_eq!(result[0].id, "block-1");
        assert_eq!(
            client.transport.requests.borrow().as_slice(),
            ["search:pinned:10"]
        );
    }

    #[test]
    fn request_bounds_are_enforced_before_transport() {
        let transport = MockTransport::new(BrokerResponse::SearchResults(Vec::new()));
        let client = SiyuanClient::new(true, transport);
        assert_eq!(
            client.search_blocks("select\n*", 10),
            Err(ClientError::InvalidQuery)
        );
        assert_eq!(
            client.search_blocks("ok", 0),
            Err(ClientError::InvalidLimit)
        );
        assert!(client.transport.requests.borrow().is_empty());
    }

    #[test]
    fn response_variants_and_payload_sizes_are_fail_closed() {
        let mismatch = SiyuanClient::new(
            true,
            MockTransport::new(BrokerResponse::Notebooks(Vec::new())),
        );
        assert_eq!(mismatch.status(), Err(ClientError::ResponseTypeMismatch));

        let too_large = SiyuanClient::new(
            true,
            MockTransport::new(BrokerResponse::Block(Block {
                id: "block-1".to_owned(),
                notebook_id: "notebook-1".to_owned(),
                path: "/spec".to_owned(),
                markdown: "x".repeat(MAX_BLOCK_CONTENT_BYTES + 1),
            })),
        );
        assert_eq!(
            too_large.get_block("block-1"),
            Err(ClientError::ResponseTooLarge)
        );
    }

    #[test]
    fn errors_are_stable_codes_without_transport_or_token_detail() {
        let rendered = ClientError::TransportUnavailable.to_string();
        assert_eq!(rendered, "siyuan_transport_unavailable");
        assert!(!rendered.contains("token"));
        assert!(!rendered.contains("http"));
    }

    #[test]
    fn native_http_transport_keeps_auth_code_in_native_login_and_uses_session_cookie() {
        let token = "0".repeat(32);
        let (port, requests, server) = mock_http_server(vec![
            r#"{"code":0,"msg":"","data":null}"#.to_owned(),
            r#"{"code":0,"msg":"","data":{"notebooks":[{"id":"20260820-book","name":"Project","closed":false}]}}"#
                .to_owned(),
        ]);
        let transport = HttpSiyuanTransport::new(port, token.clone()).unwrap();
        assert!(!format!("{transport:?}").contains(token.as_str()));
        let client = SiyuanClient::new(true, transport);
        assert_eq!(client.list_notebooks().unwrap()[0].name, "Project");
        let login = requests.recv().unwrap();
        let request = requests.recv().unwrap();
        assert!(login.starts_with("POST /api/system/loginAuth HTTP/1.1"));
        assert!(login.contains(token.as_str()));
        assert!(request.starts_with("POST /api/notebook/lsNotebooks HTTP/1.1"));
        assert!(request
            .to_ascii_lowercase()
            .contains("cookie: siyuan=vibespace-native-session"));
        assert!(!request.contains(token.as_str()));
        assert!(!request.to_ascii_lowercase().contains("authorization:"));
        server.join().unwrap();
    }

    #[test]
    fn native_search_transport_selects_full_text_mode_and_never_sql() {
        let token = "a".repeat(32);
        let (port, requests, server) = mock_http_server(vec![
            r#"{"code":0,"msg":"","data":null}"#.to_owned(),
            r#"{"code":0,"msg":"","data":{"blocks":[{"id":"20260820-block","box":"20260820-book","path":"/spec.sy","content":"Pinned runtime"}]}}"#
                .to_owned(),
        ]);
        let client =
            SiyuanClient::new(true, HttpSiyuanTransport::new(port, token.clone()).unwrap());
        assert_eq!(
            client.search_blocks("pinned", 5).unwrap()[0].id,
            "20260820-block"
        );
        let login = requests.recv().unwrap();
        let request = requests.recv().unwrap();
        assert!(login.starts_with("POST /api/system/loginAuth HTTP/1.1"));
        assert!(request.starts_with("POST /api/search/fullTextSearchBlock HTTP/1.1"));
        assert!(request.contains("\"method\":0"));
        assert!(!request.contains("/api/query/sql"));
        assert!(!request.contains(token.as_str()));
        server.join().unwrap();
    }

    #[test]
    fn native_get_block_combines_bounded_metadata_and_kramdown_endpoints() {
        let token = "f".repeat(32);
        let (port, requests, server) = mock_http_server(vec![
            r#"{"code":0,"msg":"","data":null}"#.to_owned(),
            r#"{"code":0,"msg":"","data":{"box":"20260820-book","path":"/spec.sy"}}"#.to_owned(),
            r##"{"code":0,"msg":"","data":{"id":"20260820-block","kramdown":"# Spec"}}"##
                .to_owned(),
        ]);
        let client =
            SiyuanClient::new(true, HttpSiyuanTransport::new(port, token.clone()).unwrap());
        let block = client.get_block("20260820-block").unwrap();
        assert_eq!(block.notebook_id, "20260820-book");
        assert_eq!(block.markdown, "# Spec");
        let login = requests.recv().unwrap();
        let first = requests.recv().unwrap();
        let second = requests.recv().unwrap();
        assert!(login.starts_with("POST /api/system/loginAuth HTTP/1.1"));
        assert!(first.starts_with("POST /api/block/getBlockInfo HTTP/1.1"));
        assert!(second.starts_with("POST /api/block/getBlockKramdown HTTP/1.1"));
        assert!(!first.contains(token.as_str()));
        assert!(!second.contains(token.as_str()));
        server.join().unwrap();
    }
}
